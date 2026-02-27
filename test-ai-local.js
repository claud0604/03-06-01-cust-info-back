/**
 * Utility: Test AI diagnosis flow locally
 * Usage: node test-ai-local.js <customerId>
 *
 * Tests the full flow: MongoDB -> S3 download -> Gemini Vision -> Save result
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('./models/Customer');
const { s3Client, S3_CONFIG } = require('./config/s3');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const customerId = process.argv[2];

if (!customerId) {
    console.log('Usage: node test-ai-local.js <customerId>');
    process.exit(1);
}

async function getS3ImageAsBase64(s3Key) {
    const command = new GetObjectCommand({
        Bucket: S3_CONFIG.bucket,
        Key: s3Key
    });

    const response = await s3Client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
        chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    return {
        base64: buffer.toString('base64'),
        contentType: response.ContentType || 'image/jpeg'
    };
}

async function main() {
    console.log('1. Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('   Connected.\n');

    console.log('2. Fetching customer...');
    const customer = await Customer.findOne({ customerId });
    if (!customer) {
        console.log(`   Customer not found: ${customerId}`);
        process.exit(1);
    }
    console.log(`   Found: ${customer.customerInfo.name}\n`);

    const faceFrontKey = customer.customerPhotos.face.front;
    const bodyFrontKey = customer.customerPhotos.body.front;

    if (!faceFrontKey || !bodyFrontKey) {
        console.log('   Missing required photos (face front / body front)');
        process.exit(1);
    }

    console.log('3. Downloading images from S3...');
    console.log(`   Face: ${faceFrontKey}`);
    console.log(`   Body: ${bodyFrontKey}`);
    const faceImage = await getS3ImageAsBase64(faceFrontKey);
    const bodyImage = await getS3ImageAsBase64(bodyFrontKey);
    console.log(`   Face image: ${(faceImage.base64.length * 0.75 / 1024).toFixed(0)} KB`);
    console.log(`   Body image: ${(bodyImage.base64.length * 0.75 / 1024).toFixed(0)} KB\n`);

    console.log('4. Calling Gemini Vision API...');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are a professional personal color consultant. Analyze the provided photos and return a JSON object with: personalColor, faceShape, bodyType, personalColorDetail, faceShapeDetail, bodyTypeDetail, personalColorCharacteristics (hue, value, chroma, contrast), faceFeatures (forehead, cheekbone, jawline), bodyFeatures (shoulder, waist, hip), stylingKeywords, bestColors, avoidColors. Customer: ${customer.customerInfo.name}, Age ${customer.customerInfo.age}, ${customer.customerInfo.gender}. Respond with JSON only, no code blocks.`;

    const result = await model.generateContent([
        prompt,
        { inlineData: { data: faceImage.base64, mimeType: faceImage.contentType } },
        { inlineData: { data: bodyImage.base64, mimeType: bodyImage.contentType } }
    ]);

    const rawResponse = result.response.text();
    console.log(`   Response length: ${rawResponse.length} chars\n`);

    let diagnosis;
    try {
        diagnosis = JSON.parse(rawResponse);
    } catch (e) {
        const match = rawResponse.match(/\{[\s\S]*\}/);
        if (match) {
            diagnosis = JSON.parse(match[0]);
        } else {
            console.log('   JSON parse failed. Raw response:');
            console.log(rawResponse);
            process.exit(1);
        }
    }

    console.log('5. Diagnosis Result:');
    console.log(`   Personal Color: ${diagnosis.personalColor}`);
    console.log(`   Face Shape: ${diagnosis.faceShape}`);
    console.log(`   Body Type: ${diagnosis.bodyType}`);
    console.log(`   Best Colors: ${diagnosis.bestColors?.join(', ')}`);
    console.log(`   Styling: ${diagnosis.stylingKeywords?.join(', ')}\n`);

    console.log('6. Saving to MongoDB...');
    customer.aiDiagnosis = {
        ...diagnosis,
        generatedAt: new Date(),
        isCompleted: true,
        rawGeminiResponse: rawResponse
    };
    await customer.save();
    console.log('   Saved successfully.\n');

    console.log('Done!');
    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
