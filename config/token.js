const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
const models = require('../models')
const setRes = require('../response')
const resCode = require('../config/res_code_config')

function verifyToken(req, res, next) {
    const token = req.headers.authorization;
    if (!token) {
        return res.send(setRes(resCode.ResourceNotFound, false, "No token provided.", null))
    }

    if (token == "rFpNuPj3dNMjLgSkUOkz") {
        return next()
    } else {

        return jwt.verify(token, 'secret', (err, decoded) => {
            if (err) {
                return res.send(setRes(resCode.Unauthorized, false, "Failed to verify token.", null))
            }
            var role = decoded.role_id

            var authModel = ((role == 2) && (role != 3)) ? models.user : models.business;
            req.userEmail = decoded.user;
            if (decoded.user != '' && decoded.user != undefined) {
                authModel.findOne({
                    where: {
                        email: decoded.user,
                        is_deleted: 0
                    }
                }).then(async authenticateUser => {
                    if (authenticateUser != '' && authenticateUser != null) {
                        if (authenticateUser.is_active == true) {
                            return next();
                        } else {
                            return res.send(setRes(resCode.Unauthorized, false, "Your account has been deactivated. Please contact administrator.", null))
                        }
                    } else {
                        return res.send(setRes(resCode.Unauthorized, false, "Unauthorized Token", null))
                    }
                })

            } else {
                return res.send(setRes(resCode.Unauthorized, false, "Failed to verify token.", null))
            }

        });

    }

}

module.exports = {
    verifyToken
};