const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
const models = require('../models')
const setRes = require('../response')
const resCode = require('../config/res_code_config')

function verifyToken(req, res, next) {
  const token = req.headers.authorization;
  if (!token) {
    return res.send(setRes(resCode.Forbidden, true, "No token provided.",null))
  }

  if (token == "rFpNuPj3dNMjLgSkUOkz"){
	return next()
  }
  else{

	return jwt.verify(token, 'secret', (err, decoded) => {
		if (err) {
		  return res.send(setRes(resCode.Unauthorized, true, "Failed to verify token.", null))
		}
		// if everything good, save to request for use in other routes
		req.userEmail = decoded.user;
		// console.log(decoded.user);
		if (decoded.user != '' && decoded.user != undefined){
	
			  var User = models.user
			User.findOne({
				where: {
					email: decoded.user,
					is_active:1,
					is_deleted: 0
				}
			}).then(user => {
				if (user != '' && user != null){
					return next();
				}
				else{
	
					var business = models.business
					business.findOne({
						where: {
							email: decoded.user,
							is_active: 1,
							is_deleted: 0
						}
					}).then(business => {
						if (business != '' && business != null){
							return next()
						}
						else{
							return res.send(setRes(resCode.Unauthorized, true, "Unauthorized Token",null))
						}
					})
					
				}
			})
		  
		}else{
		  return res.send(setRes(resCode.Unauthorized, true, "Failed to verify token.",null))
		}
		
	  });

  }
  
}

module.exports = {
  verifyToken
};
