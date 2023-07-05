const jwt = require('jsonwebtoken');
const setRes = require('../response')
const resCode = require('../config/res_code_config')

function authorize(roles = []) {
    let rolesData = roles;

    if (typeof rolesData === 'string') {
        rolesData = [rolesData];
    }
    return [
        (req, res, next) => {
            if (req.headers.authorization) {
                const [token] = req.headers.authorization.split(' ');
                try {
                    if (token) {
                        const decoded = jwt.verify(token, 'secret');
                        req.user = decoded;
                        if (rolesData.length && !rolesData.includes(req.user.role_id)) {
                            return res.send(setRes(resCode.Unauthorized, true, "Unauthorized user.", null))
                        }
                        return next();
                    }
                    return res.send(setRes(resCode.Unauthorized, false, "Invalid Token Access denied/Unauthorized.", null))
                } catch (err) {
                    return res.send(setRes(
                        resCode.Unauthorized,
                        false,
                        'Invalid Token Access denied/Unauthorized',
                        httpStatus.FORBIDDEN
                    ));
                }
            }
            return res.send(setRes(resCode.ResourceNotFound, false, "No token provided.", null))
        },
    ];

}

module.exports = {
    authorize
};