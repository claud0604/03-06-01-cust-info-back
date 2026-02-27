/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({
            success: false,
            message: 'Invalid input data.',
            errors: messages
        });
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        return res.status(409).json({
            success: false,
            message: 'Duplicate data already exists.',
            field: Object.keys(err.keyValue)[0]
        });
    }

    // MongoDB CastError
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: 'Invalid ID format.'
        });
    }

    // AWS S3 error
    if (err.name === 'S3ServiceException' || err.$metadata) {
        return res.status(500).json({
            success: false,
            message: 'File storage error.',
            code: err.Code || err.name
        });
    }

    // Default error
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error.',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
