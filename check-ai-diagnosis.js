/**
 * Utility: Check AI diagnosis results
 * Usage: node check-ai-diagnosis.js <customerId>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('./models/Customer');

const customerId = process.argv[2];

if (!customerId) {
    console.log('Usage: node check-ai-diagnosis.js <customerId>');
    process.exit(1);
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected\n');

    const customer = await Customer.findOne({ customerId });

    if (!customer) {
        console.log(`Customer not found: ${customerId}`);
    } else {
        console.log(`Customer: ${customer.customerInfo.name} (${customerId})\n`);

        const ai = customer.aiDiagnosis;

        if (!ai || !ai.isCompleted) {
            console.log('AI diagnosis not completed.');
        } else {
            console.log('=== Personal Color ===');
            console.log(`Type: ${ai.personalColor}`);
            console.log(`Detail: ${ai.personalColorDetail}`);
            console.log(`Characteristics:`, ai.personalColorCharacteristics);
            console.log(`Best Colors: ${ai.bestColors?.join(', ')}`);
            console.log(`Avoid Colors: ${ai.avoidColors?.join(', ')}`);

            console.log('\n=== Face Shape ===');
            console.log(`Type: ${ai.faceShape}`);
            console.log(`Detail: ${ai.faceShapeDetail}`);
            console.log(`Features:`, ai.faceFeatures);

            console.log('\n=== Body Type ===');
            console.log(`Type: ${ai.bodyType}`);
            console.log(`Detail: ${ai.bodyTypeDetail}`);
            console.log(`Features:`, ai.bodyFeatures);

            console.log('\n=== Styling ===');
            console.log(`Keywords: ${ai.stylingKeywords?.join(', ')}`);
            console.log(`Generated at: ${ai.generatedAt}`);
        }
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
