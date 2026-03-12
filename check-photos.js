/**
 * Utility: Check uploaded photos for a customer
 * Usage: node check-photos.js <customerId>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('./models/Customer');

const customerId = process.argv[2];

if (!customerId) {
    console.log('Usage: node check-photos.js <customerId>');
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

        console.log('=== Face Photos ===');
        console.log(`Front:  ${customer.customerPhotos.face.front || '(empty)'}`);
        console.log(`Side:   ${customer.customerPhotos.face.side || '(empty)'}`);
        console.log(`Video:  ${customer.customerPhotos.face.video || '(empty)'}`);

        console.log('\n=== Body Photos ===');
        console.log(`Front:  ${customer.customerPhotos.body.front || '(empty)'}`);
        console.log(`Side:   ${customer.customerPhotos.body.side || '(empty)'}`);
        console.log(`Video:  ${customer.customerPhotos.body.video || '(empty)'}`);

        console.log('\n=== Reference ===');
        console.log(`Makeup:  ${customer.customerPhotos.reference.makeup.length} files`);
        console.log(`Fashion: ${customer.customerPhotos.reference.fashion.length} files`);

        console.log('\n=== Media Metadata ===');
        console.log(`Total size: ${(customer.mediaMetadata.totalSizeBytes / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Status: ${customer.mediaMetadata.processingStatus}`);

        const hasFace = !!customer.customerPhotos.face.front;
        const hasBody = !!customer.customerPhotos.body.front;
        console.log(`\nReady for AI diagnosis: ${hasFace && hasBody ? 'YES' : 'NO'} (face: ${hasFace}, body: ${hasBody})`);
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
