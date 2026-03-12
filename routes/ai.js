/**
 * AI Diagnosis API — Gemini 3.1 Flash Lite Vision
 *
 * For cust-info backend, Gemini Vision analyzes customer photos from GCS.
 * Internal classification runs on the landing backend only.
 */
const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const { bucket } = require('../config/gcs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// Note: Internal classifier removed from cust-info backend.
// Classification runs on landing backend; cust-info uses Gemini Vision only.

// Gemini setup
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI = null;

if (GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE') {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('Gemini API initialized (gemini-3.1-flash-lite)');
} else {
    console.warn('GEMINI_API_KEY not set. AI diagnosis disabled.');
}

/**
 * APL Personal Color Diagnosis Guidelines
 */
const APL_DIAGNOSIS_GUIDELINE = `
# APL Personal Color Diagnosis Guidelines

You are a professional personal color consultant. Analyze the provided customer face and body photos to diagnose the following three areas:
1. Personal Color (one of 14 season types)
2. Face Shape (one of 7 types)
3. Body Type (one of 5 types)

## 1. Personal Color Diagnosis Criteria

### Analysis Factors
- **Hue**: Skin undertone - Warm (yellow/orange) vs Cool (blue/pink)
- **Value**: Overall brightness of skin/eyes/hair - High/Middle/Low
- **Chroma**: Color vividness vs mutedness - High/Medium/Low
- **Contrast**: Brightness contrast between skin-eyes-hair - Low/Middle/High

### 14 Season Types

#### SPRING (Warm + Bright/Vivid)
- **Spring Light**: Peach base, transparent bright skin, light brown eyes
- **Spring Bright**: Very bright and vivid skin, clear bright eyes
- **Spring Soft**: Muted feel, soft calm brown eyes
- **Spring Clear**: Transparent clean skin, vivid clear eyes

#### SUMMER (Cool + Bright/Soft)
- **Summer Light**: Clear clean cool tone skin, soft calm brown eyes
- **Summer Bright**: Cool and vivid skin, bright clear eyes
- **Summer Mute**: Warm-cool balance, deep calm eyes

#### AUTUMN (Warm + Deep/Muted)
- **Autumn Mute**: Subtle yellow undertone, soft muted feel, deep calm brown
- **Autumn Deep**: Deep rich warm tone, dark brown eyes, black hair
- **Autumn Strong**: Intense warmth, dark strong eyes

#### WINTER (Cool + Vivid/Deep)
- **Winter Clear**: Transparent clean cool tone, clear vivid black eyes
- **Winter Strong**: Bright cool tone, high contrast, sharp black eyes
- **Winter Deep**: Cool deep tone, deep strong eyes
- **Winter Soft**: Soft cool tone, subtle brown-gray eyes

### Diagnosis Process
1. Estimate skin tone shade (13-23 range)
2. Determine undertone: Yellow (Warm) vs Blue (Cool)
3. Analyze value/chroma/contrast
4. Determine season group: Warm -> Spring/Autumn, Cool -> Summer/Winter
5. Determine specific type from 14 types based on brightness+chroma+contrast

## 2. Face Shape Diagnosis

### 7 Face Shape Types
1. **Oval**: Balanced forehead-cheekbone-jawline, rounded chin
2. **Round**: Overall soft curves, wider proportions
3. **Square**: Angular forehead and jawline, wide jaw
4. **Oblong**: Vertically elongated, wide forehead
5. **Heart**: Wide forehead, pointed chin
6. **Diamond**: Widest at cheekbones, narrow forehead and chin
7. **Inverted Triangle**: Wide forehead, narrow pointed chin

## 3. Body Type Diagnosis

### 5 Body Types
1. **Straight**: Wide shoulders, thicker waist, upper body volume
2. **Wave**: Narrow shoulders, thin waist, lower body volume
3. **Natural**: Prominent bone structure, muscular, angular
4. **Apple**: Upper body volume, prominent abdomen
5. **Hourglass**: Similar shoulder and hip width, defined waist

---

## Response Format (JSON)

**IMPORTANT: Respond ONLY with pure JSON. No code blocks, no markdown, just the JSON object.**

{
  "personalColor": "Spring Light",
  "personalColorDetail": "Your skin has a transparent, bright peach base undertone...",
  "personalColorCharacteristics": {
    "hue": "Warm",
    "value": "High",
    "chroma": "Medium",
    "contrast": "Low"
  },
  "faceShape": "Oval",
  "faceShapeDetail": "Balanced forehead, cheekbones, and jawline...",
  "faceFeatures": {
    "forehead": "Medium width, soft line",
    "cheekbone": "Moderate width",
    "jawline": "Soft rounded curve"
  },
  "bodyType": "Wave",
  "bodyTypeDetail": "Narrow shoulders with a thin waist...",
  "bodyFeatures": {
    "shoulder": "Narrow",
    "waist": "Defined",
    "hip": "Voluminous"
  },
  "stylingKeywords": ["Feminine", "Romantic", "Soft", "Bright"],
  "bestColors": ["Peach", "Coral", "Ivory", "Light Beige", "Soft Yellow"],
  "avoidColors": ["Black", "Cool Gray", "Neon", "Dark Brown"]
}
`;

/**
 * Download GCS image and convert to base64
 */
async function getGCSImageAsBase64(gcsKey) {
    if (!gcsKey) return null;

    try {
        const file = bucket.file(gcsKey);
        const [buffer] = await file.download();
        const base64 = buffer.toString('base64');
        return { base64, contentType: 'image/jpeg' };
    } catch (error) {
        console.error('GCS image download failed:', error.message);
        return null;
    }
}

/**
 * Call Gemini Vision API
 */
async function callGeminiVision(faceImage, bodyImage, prompt) {
    if (!genAI) {
        throw new Error('GEMINI_API_KEY is not configured.');
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    const imageParts = [];

    if (faceImage) {
        imageParts.push({
            inlineData: {
                data: faceImage.base64,
                mimeType: faceImage.contentType
            }
        });
    }

    if (bodyImage) {
        imageParts.push({
            inlineData: {
                data: bodyImage.base64,
                mimeType: bodyImage.contentType
            }
        });
    }

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const rawResponse = response.text();

    console.log('Gemini raw response (first 500 chars):', rawResponse.substring(0, 500));

    // Parse JSON from response
    let diagnosis;
    try {
        diagnosis = JSON.parse(rawResponse);
        console.log('JSON parse success');
    } catch (parseError) {
        let jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)\s*```/);
        if (!jsonMatch) {
            jsonMatch = rawResponse.match(/```\s*([\s\S]*?)\s*```/);
        }
        if (!jsonMatch) {
            jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        }

        if (jsonMatch) {
            const jsonString = jsonMatch[1] || jsonMatch[0];
            try {
                diagnosis = JSON.parse(jsonString);
                console.log('JSON extracted from code block');
            } catch (e) {
                throw new Error(`JSON parse failed: ${parseError.message}`);
            }
        } else {
            throw new Error(`JSON parse failed: ${parseError.message}`);
        }
    }

    console.log('Diagnosis result:', {
        personalColor: diagnosis.personalColor,
        faceShape: diagnosis.faceShape,
        bodyType: diagnosis.bodyType
    });

    return { diagnosis, rawResponse };
}

/**
 * POST /api/ai/diagnose
 * Hybrid: Internal classifier (if measurements available) + Gemini 3.1 Flash Lite Vision
 */
router.post('/diagnose', async (req, res) => {
    try {
        const { customerId } = req.body;

        if (!customerId) {
            return res.status(400).json({
                success: false,
                message: 'customerId is required.'
            });
        }

        console.log(`AI diagnosis started: ${customerId}`);

        // 1. Get customer
        const customer = await Customer.findOne({ customerId });
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found.'
            });
        }

        // 2. Check required photos
        const faceFrontKey = customer.customerPhotos.face.front;
        const bodyFrontKey = customer.customerPhotos.body.front;

        if (!faceFrontKey || !bodyFrontKey) {
            return res.status(400).json({
                success: false,
                message: 'Face front photo and body front photo are required.'
            });
        }

        // 3. Download GCS images as base64
        console.log('Downloading GCS images...');
        const faceImage = await getGCSImageAsBase64(faceFrontKey);
        const bodyImage = await getGCSImageAsBase64(bodyFrontKey);

        if (!faceImage || !bodyImage) {
            return res.status(500).json({
                success: false,
                message: 'GCS image download failed.'
            });
        }

        // 4. Build prompt (Gemini-only mode)
        const prompt = `${APL_DIAGNOSIS_GUIDELINE}

Customer Info: Name ${customer.customerInfo.name}, Age ${customer.customerInfo.age}, Gender ${customer.customerInfo.gender === 'female' ? 'Female' : 'Male'}

Analyze the photos below and diagnose personal color, face shape, and body type. Respond with JSON only.`;

        // 5. Call Gemini Vision API
        console.log('Calling Gemini Vision API...');
        const { diagnosis, rawResponse } = await callGeminiVision(faceImage, bodyImage, prompt);

        // 6. Save to aiDiagnosis
        customer.aiDiagnosis = {
            personalColor: diagnosis.personalColor,
            personalColorDetail: diagnosis.personalColorDetail,
            personalColorCharacteristics: diagnosis.personalColorCharacteristics,
            faceShape: diagnosis.faceShape,
            faceShapeDetail: diagnosis.faceShapeDetail,
            faceFeatures: diagnosis.faceFeatures,
            bodyType: diagnosis.bodyType,
            bodyTypeDetail: diagnosis.bodyTypeDetail,
            bodyFeatures: diagnosis.bodyFeatures,
            stylingKeywords: diagnosis.stylingKeywords,
            bestColors: diagnosis.bestColors,
            avoidColors: diagnosis.avoidColors,
            generatedAt: new Date(),
            isCompleted: true,
            rawGeminiResponse: rawResponse,
            classificationSource: 'gemini'
        };

        await customer.save();

        console.log(`AI diagnosis complete: ${diagnosis.personalColor}, ${diagnosis.faceShape}, ${diagnosis.bodyType}`);

        res.json({
            success: true,
            aiDiagnosis: customer.aiDiagnosis
        });

    } catch (error) {
        console.error('AI diagnosis error:', error);
        res.status(500).json({
            success: false,
            message: 'AI diagnosis failed.',
            error: error.message
        });
    }
});

module.exports = router;
