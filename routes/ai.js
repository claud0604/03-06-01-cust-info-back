/**
 * AI Diagnosis API — Hybrid: Internal Classifier + Gemini 3.1 Flash Lite Vision
 *
 * For cust-info (expert panel), images are available from GCS.
 * Flow:
 *   1. If measurements are available → internal classifier runs first
 *   2. Gemini 3.1 Flash Lite Vision analyzes photos
 *   3. If internal result exists, Gemini is told the pre-classified type
 *   4. Results merged: internal type (if high confidence) + Gemini description
 */
const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const { bucket } = require('../config/gcs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { fullDiagnosis, classifyPersonalColor, labUtils } = require('../services/apl-color-classifier');

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
 * Build hybrid prompt when internal classifier has already determined the type
 */
function buildHybridVisionPrompt(internalResult, customerInfo) {
    const pc = internalResult.personalColor;

    let prompt = `# APL Personal Color Diagnosis — Expert Description Writer

You are a professional personal color consultant. Our internal classification engine has analyzed the customer's color measurements and determined the following:

## Pre-Determined Classification (DO NOT change the type)
- Personal Color: ${pc.type}
- Season: ${pc.season}
- Confidence: ${pc.confidence}
- Characteristics: Hue=${pc.characteristics.hue}, Value=${pc.characteristics.value}, Chroma=${pc.characteristics.chroma}, Contrast=${pc.characteristics.contrast}`;

    if (internalResult.faceShape) {
        prompt += `\n- Face Shape: ${internalResult.faceShape.type} (confidence: ${internalResult.faceShape.confidence})`;
    }
    if (internalResult.bodyType) {
        prompt += `\n- Body Type: ${internalResult.bodyType.type} (confidence: ${internalResult.bodyType.confidence})`;
    }

    prompt += `

## Your Task
Analyze the photos and write professional, detailed descriptions for the diagnosis.
The personal color TYPE is already decided — focus on writing expert-level explanations.
You may refine face shape and body type based on the photos if the internal result seems inaccurate.

Customer Info: Name ${customerInfo.name}, Age ${customerInfo.age}, Gender ${customerInfo.gender === 'female' ? 'Female' : 'Male'}

Respond with JSON only:
{
  "personalColor": "${pc.type}",
  "personalColorDetail": "...",
  "personalColorCharacteristics": ${JSON.stringify(pc.characteristics)},
  "faceShape": "${internalResult.faceShape ? internalResult.faceShape.type : '...'}",
  "faceShapeDetail": "...",
  "faceFeatures": { "forehead": "...", "cheekbone": "...", "jawline": "..." },
  "bodyType": "${internalResult.bodyType ? internalResult.bodyType.type : '...'}",
  "bodyTypeDetail": "...",
  "bodyFeatures": { "shoulder": "...", "waist": "...", "hip": "..." },
  "stylingKeywords": ["...", "...", "...", "..."],
  "bestColors": ["...", "...", "...", "...", "..."],
  "avoidColors": ["...", "...", "...", "..."]
}`;

    return prompt;
}

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

        // 3. Run internal classifier if measurement data is available
        let internalResult = null;
        const measurements = customer.faceAnalysis || customer.measurements;

        if (measurements && measurements.skinColor && measurements.skinColor.lab) {
            try {
                const classifierInput = {
                    skinColor: measurements.skinColor,
                    hairColor: measurements.hairColor || null,
                    eyeColor: measurements.eyeColor || null,
                    contrast: measurements.contrast || null,
                    backgroundColor: measurements.backgroundColor || null,
                    neckColor: measurements.neckColor || null,
                    faceProportions: measurements.faceProportions || null,
                    bodyProportions: measurements.bodyProportions || null
                };

                // Convert background RGB to LAB if needed
                if (classifierInput.backgroundColor && !classifierInput.backgroundColor.lab && classifierInput.backgroundColor.rgb) {
                    const { r, g, b } = classifierInput.backgroundColor.rgb;
                    classifierInput.backgroundColor = { lab: labUtils.rgbToLab(r, g, b), rgb: classifierInput.backgroundColor.rgb };
                }

                internalResult = fullDiagnosis(classifierInput);
                console.log(`Internal classifier: ${internalResult.personalColor.type} (confidence: ${internalResult.personalColor.confidence}), strategy: ${internalResult.strategy}`);
            } catch (err) {
                console.warn('Internal classifier skipped:', err.message);
            }
        }

        // 4. Download GCS images as base64
        console.log('Downloading GCS images...');
        const faceImage = await getGCSImageAsBase64(faceFrontKey);
        const bodyImage = await getGCSImageAsBase64(bodyFrontKey);

        if (!faceImage || !bodyImage) {
            return res.status(500).json({
                success: false,
                message: 'GCS image download failed.'
            });
        }

        // 5. Build prompt based on strategy
        const useInternalType = internalResult && internalResult.strategy !== 'gemini';
        let prompt;

        if (useInternalType) {
            prompt = buildHybridVisionPrompt(internalResult, customer.customerInfo);
        } else {
            prompt = `${APL_DIAGNOSIS_GUIDELINE}

Customer Info: Name ${customer.customerInfo.name}, Age ${customer.customerInfo.age}, Gender ${customer.customerInfo.gender === 'female' ? 'Female' : 'Male'}

Analyze the photos below and diagnose personal color, face shape, and body type. Respond with JSON only.`;
        }

        // 6. Call Gemini Vision API
        console.log(`Calling Gemini Vision API (mode: ${useInternalType ? 'hybrid' : 'full'})...`);
        const { diagnosis, rawResponse } = await callGeminiVision(faceImage, bodyImage, prompt);

        // 7. Merge results
        const finalDiagnosis = {};

        if (useInternalType) {
            finalDiagnosis.personalColor = internalResult.personalColor.type;
            finalDiagnosis.personalColorCharacteristics = internalResult.personalColor.characteristics;
        } else {
            finalDiagnosis.personalColor = diagnosis.personalColor;
            finalDiagnosis.personalColorCharacteristics = diagnosis.personalColorCharacteristics;
        }

        // Description and other fields from Gemini
        finalDiagnosis.personalColorDetail = diagnosis.personalColorDetail;
        finalDiagnosis.faceShape = diagnosis.faceShape;
        finalDiagnosis.faceShapeDetail = diagnosis.faceShapeDetail;
        finalDiagnosis.faceFeatures = diagnosis.faceFeatures;
        finalDiagnosis.bodyType = diagnosis.bodyType;
        finalDiagnosis.bodyTypeDetail = diagnosis.bodyTypeDetail;
        finalDiagnosis.bodyFeatures = diagnosis.bodyFeatures;
        finalDiagnosis.stylingKeywords = diagnosis.stylingKeywords;
        finalDiagnosis.bestColors = diagnosis.bestColors;
        finalDiagnosis.avoidColors = diagnosis.avoidColors;

        // 8. Save to aiDiagnosis
        customer.aiDiagnosis = {
            ...finalDiagnosis,
            generatedAt: new Date(),
            isCompleted: true,
            rawGeminiResponse: rawResponse,
            classificationSource: useInternalType ? 'internal' : 'gemini',
            internalClassification: internalResult ? {
                personalColor: internalResult.personalColor,
                faceShape: internalResult.faceShape,
                bodyType: internalResult.bodyType,
                backgroundCorrection: internalResult.backgroundCorrection,
                confidence: internalResult.confidence,
                strategy: internalResult.strategy
            } : null
        };

        await customer.save();

        console.log(`AI diagnosis complete: ${finalDiagnosis.personalColor}, ${finalDiagnosis.faceShape}, ${finalDiagnosis.bodyType} (${useInternalType ? 'internal' : 'gemini'})`);

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

/**
 * POST /api/ai/classify
 * Internal classification only (no Gemini call) — for testing/debugging
 */
router.post('/classify', async (req, res) => {
    try {
        const { measurements } = req.body;

        if (!measurements || !measurements.skinColor || !measurements.skinColor.lab) {
            return res.status(400).json({
                success: false,
                message: 'measurements.skinColor.lab is required.'
            });
        }

        // Convert background RGB to LAB if needed
        if (measurements.backgroundColor && !measurements.backgroundColor.lab && measurements.backgroundColor.rgb) {
            const { r, g, b } = measurements.backgroundColor.rgb;
            measurements.backgroundColor = { lab: labUtils.rgbToLab(r, g, b), rgb: measurements.backgroundColor.rgb };
        }

        const result = fullDiagnosis(measurements);

        res.json({
            success: true,
            result
        });
    } catch (error) {
        console.error('Classification error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Classification failed.',
            error: error.message
        });
    }
});

module.exports = router;
