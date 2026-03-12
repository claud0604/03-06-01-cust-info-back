/**
 * Customer CRUD API Routes
 */
const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const authApiKey = require('../middleware/authApiKey');

/**
 * Generate Customer ID: timestamp with milliseconds (17 digits)
 */
function generateCustomerId() {
    const now = new Date();
    // Convert to KST (UTC+9)
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const y = kst.getUTCFullYear();
    const mo = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kst.getUTCDate()).padStart(2, '0');
    const h = String(kst.getUTCHours()).padStart(2, '0');
    const mi = String(kst.getUTCMinutes()).padStart(2, '0');
    const s = String(kst.getUTCSeconds()).padStart(2, '0');
    const ms = String(kst.getUTCMilliseconds()).padStart(3, '0');
    return `${y}${mo}${d}${h}${mi}${s}${ms}`;
}

/**
 * POST /api/customers
 * Create new customer record (public)
 */
router.post('/', async (req, res, next) => {
    try {
        const { customerInfo } = req.body;

        const customerId = generateCustomerId();

        // Duplicate check (extremely unlikely with ms precision)
        const existing = await Customer.findOne({ customerId });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'Duplicate customer ID. Please try again.',
                customerId
            });
        }

        const customer = new Customer({
            customerId,
            customerInfo,
            appointment: { date: '', time: '' },
            customerPhotos: {
                face: { front: '', side: '', video: '' },
                body: { front: '', side: '', video: '' },
                reference: { makeup: [], fashion: [] }
            },
            mediaMetadata: {
                totalSizeBytes: 0,
                uploadedAt: null,
                processingStatus: 'pending'
            },
            meta: {
                status: 'pending'
            }
        });

        await customer.save();

        res.status(201).json({
            success: true,
            data: customer,
            customerId
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/customers
 * List customers with pagination (protected)
 */
router.get('/', authApiKey, async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            search
        } = req.query;

        const query = {};

        if (status) {
            query['meta.status'] = status;
        }

        if (search) {
            query['customerInfo.name'] = { $regex: search, $options: 'i' };
        }

        const customers = await Customer.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .select('-__v');

        const total = await Customer.countDocuments(query);

        res.json({
            success: true,
            data: customers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/customers/:customerId
 * Get single customer (protected)
 */
router.get('/:customerId', authApiKey, async (req, res, next) => {
    try {
        const { customerId } = req.params;
        const customer = await Customer.findOne({ customerId }).select('-__v');

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found.'
            });
        }

        res.json({
            success: true,
            data: customer
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/customers/:customerId
 * Update customer info (protected)
 */
router.put('/:customerId', authApiKey, async (req, res, next) => {
    try {
        const { customerId } = req.params;
        const updates = req.body;

        delete updates._id;
        delete updates.customerId;

        const customer = await Customer.findOneAndUpdate(
            { customerId },
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-__v');

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found.'
            });
        }

        res.json({
            success: true,
            data: customer
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /api/customers/:customerId/photos
 * Update customer photo S3 keys (public)
 */
router.patch('/:customerId/photos', async (req, res, next) => {
    try {
        const { customerId } = req.params;
        const { customerPhotos, mediaMetadata } = req.body;

        const updateData = {};

        if (customerPhotos) {
            if (customerPhotos.face) {
                Object.keys(customerPhotos.face).forEach(key => {
                    if (customerPhotos.face[key]) {
                        updateData[`customerPhotos.face.${key}`] = customerPhotos.face[key];
                    }
                });
            }
            if (customerPhotos.body) {
                Object.keys(customerPhotos.body).forEach(key => {
                    if (customerPhotos.body[key]) {
                        updateData[`customerPhotos.body.${key}`] = customerPhotos.body[key];
                    }
                });
            }
            if (customerPhotos.reference) {
                if (customerPhotos.reference.makeup) {
                    updateData['customerPhotos.reference.makeup'] = customerPhotos.reference.makeup;
                }
                if (customerPhotos.reference.fashion) {
                    updateData['customerPhotos.reference.fashion'] = customerPhotos.reference.fashion;
                }
            }
        }

        if (mediaMetadata) {
            Object.keys(mediaMetadata).forEach(key => {
                updateData[`mediaMetadata.${key}`] = mediaMetadata[key];
            });
        }

        const customer = await Customer.findOneAndUpdate(
            { customerId },
            { $set: updateData },
            { new: true }
        ).select('-__v');

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found.'
            });
        }

        res.json({
            success: true,
            data: customer
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/customers/:customerId
 * Delete customer (protected)
 */
router.delete('/:customerId', authApiKey, async (req, res, next) => {
    try {
        const { customerId } = req.params;
        const customer = await Customer.findOneAndDelete({ customerId });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found.'
            });
        }

        res.json({
            success: true,
            message: 'Customer deleted.',
            customerId
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
