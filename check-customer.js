/**
 * Utility: Check customer status in MongoDB
 * Usage: node check-customer.js <customerId>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('./models/Customer');

const customerId = process.argv[2];

if (!customerId) {
    console.log('Usage: node check-customer.js <customerId>');
    console.log('Example: node check-customer.js 20260226143052123');
    process.exit(1);
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected\n');

    const customer = await Customer.findOne({ customerId });

    if (!customer) {
        console.log(`Customer not found: ${customerId}`);
    } else {
        console.log('=== Customer Info ===');
        console.log(`ID: ${customer.customerId}`);
        console.log(`Name: ${customer.customerInfo.name}`);
        console.log(`Gender: ${customer.customerInfo.gender}`);
        console.log(`Age: ${customer.customerInfo.age}`);
        console.log(`Phone: ${customer.customerInfo.phone}`);
        console.log(`Status: ${customer.meta.status}`);
        console.log(`Created: ${customer.createdAt}`);
        console.log('');
        console.log('=== AI Diagnosis ===');
        console.log(`Completed: ${customer.aiDiagnosis?.isCompleted || false}`);
        if (customer.aiDiagnosis?.isCompleted) {
            console.log(`Personal Color: ${customer.aiDiagnosis.personalColor}`);
            console.log(`Face Shape: ${customer.aiDiagnosis.faceShape}`);
            console.log(`Body Type: ${customer.aiDiagnosis.bodyType}`);
        }
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
