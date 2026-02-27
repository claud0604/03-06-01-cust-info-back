/**
 * API Key Authentication Middleware
 * Protects admin endpoints (list, get, update, delete)
 */
const authApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            message: 'API key is required.'
        });
    }

    if (apiKey !== process.env.APL_API_SECRET_KEY) {
        return res.status(403).json({
            success: false,
            message: 'Invalid API key.'
        });
    }

    next();
};

module.exports = authApiKey;
