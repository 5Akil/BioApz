var async = require('async')
var crypto = require('crypto')
var EmailTemplates = require('swig-email-templates')
var nodemailer = require('nodemailer')
var path = require('path')
var resCode = require('../../config/res_code_config')
var commonConfig = require('../../config/common_config')
var setRes = require('../../response')
var jwt = require('jsonwebtoken');
var models = require('../../models')
var bcrypt = require('bcrypt')
var _ = require('underscore')
var mailConfig = require('../../config/mail_config')
var util = require('util')
var notification = require('../../push_notification');
var awsConfig = require('../../config/aws_S3_config');
var moment = require('moment')

exports.Register = async (req, res) => {

  var data = req.body
  req.file ? data.profile_picture = `${req.file.key}`: '';
  var dbModel = models.user;

  var requiredFields = _.reject(['username', 'email', 'password', 'address', 'mobile','confirm_password','latitude', 'longitude'], (o) => { return _.has(data, o)  })

  if (requiredFields == ''){

    dbModel.findOne({where: {email: data.email, is_deleted: false}}).then((user) => {
      if (user == null){
        const token =  jwt.sign({user: data.email}, 'secret')
		data.auth_token = token
		// data.device_type = data.device_type.toLowerCase();

        dbModel.create(data).then(function (users) {
          if (users) {

            var transporter = nodemailer.createTransport({
              host: mailConfig.host,
              port: mailConfig.port,
              secure: mailConfig.secure,
              auth: mailConfig.auth,
              tls: mailConfig.tls
            })

            var templates = new EmailTemplates()
            var context = {
			  resetUrl: commonConfig.app_url+'/api/user/account-activation/' + token,
			  username: data.username
			}
			

            templates.render(path.join(__dirname, '../../', 'template', 'account-activation.html'), context, function (
              err,
              html,
              text,
              subject
            ) {
			//   console.log(html)
			//   return
              transporter.sendMail(
                {
                  from: 'BioApz <do-not-reply@mail.com>',
				//   to: 'abc@yopmail.com',
				to: data.email,
                //   cc: ['test1@yopmail.com', 'test2@yopmail.com'],
                  subject: 'Account Activation',
                  html: html
                },
                function (err, result) {
                  if (err) {
					    console.log("--------------------------err------------")
					    console.log(err)
                  } else {
          				console.log("--------------------------send res------------")
						console.log(result)
						res.send(setRes(resCode.OK, true,`Email has been sended to ${users.email}, with account activation instuction.. `,true));
                  }
                }
              )
            })

			  res.send(setRes(resCode.OK,true, `Email has been sended to ${users.email}, with account activation instuction.. `, null));
          } else {
              res.send(setRes(resCode.BadRequest, false, 'user registration fail',null));
          }
		})
		.catch(err => {
			res.send(setRes(resCode.InternalServer, false, err.message,null))
		});
      }
      else{
        res.send(setRes(resCode.BadRequest, false, 'User already exist',true));
      }
    }).catch(error => {
		res.send(setRes(resCode.InternalServer, false, error,null))
	})
    

  }else{
    res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
  }
  
}

exports.AccountActivationByToken = async (req, res) => {
	var data = req.params
	var dbModel = models.user

	dbModel.findOne({
		where: {
			auth_token: data.token
		}
   }).then(function (user) {
	   if (user != ''){
		dbModel.update({is_active: 1},{where: {id: user.id}})
		.then(function (userUpdated) {
		  if (userUpdated){
			res.sendFile(path.join(__dirname, '../../template', 'thank_you.html'))
		  }
		  else{
			res.sendFile(path.join(__dirname, '../../template', '404.html'))
		  }
		})
	   }
	   else{
			res.sendFile(path.join(__dirname, '../../template', '404.html'))
	   }
   }).catch(err => {
		res.sendFile(path.join(__dirname, '../../template', '404.html'))
   })
}

exports.Login = async (req, res) => {

	var data = req.body;
	var userModel = models.user
	var businessModel = models.business;
	var templateModel = models.templates
	var categoryModel = models.business_categorys

	var requiredFields = _.reject(['email', 'password', 'role', 'device_token'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){

		//user login
		if (data.role == 2){

			userModel.findOne({
			where: {
				email: data.email,
				// is_active: 1,
				// is_deleted: 0
			}
			}).then(function (user) {
				if (!user) {
					res.send(setRes(resCode.BadRequest, false ,'User not found.',null))
				} else {
					if (user.is_deleted == 1){
						res.send(setRes(resCode.BadRequest, false,'User no longer available.',null))
					}
					else if (user.is_active == 0){
						res.send(setRes(resCode.BadRequest, false ,'Please verify your account.',null))
					}
					else{
						bcrypt.compare(data.password, user.password, async function (err, result) {
							if (result == true) {

								const token =  jwt.sign({user: user.email}, 'secret', {expiresIn: 480 * 480})
								delete user.dataValues.auth_token
								user.dataValues.auth_token = token
								// data.device_type = data.device_type.toLowerCase();

								userModel.update(
									{
										auth_token: token,
										// device_type: data.device_type,
										device_token: data.device_token,
										// device_id: data.device_id
									},
									{where: {id: user.id}
								})
								.then(async function (newUser) {
									if (newUser){
										// var messagedata = await notification.SendNotification(data)
										// console.log('*********************************')
										// console.log(messagedata)
										if(user.profile_picture != null){

											var profile_picture = await awsConfig.getSignUrl(user.profile_picture).then(function(res){
												user.profile_picture = res
											})
										}
										res.send(setRes(resCode.OK, true, 'You are successfully logged in',user))
									}else{
										res.send(setRes(resCode.InternalServer, false, 'Token not updated',null))
									}
								})

							} else {
								res.send(setRes(resCode.BadRequest, false, "Invalid Email id or password",null))
							}
						});
					}
				}
			});
		}
		//business login 
		else if (data.role == 3){

			businessModel.findOne({
				where: {
					email: data.email,
					is_active: true,
					is_deleted: false
				},
				include: [templateModel, categoryModel]
		}).then(function (business) {
			if (!business) {
				res.send(setRes(resCode.BadRequest, false ,'Business not found.',null))
			} else {
				if (business.is_deleted == 1){
					res.send(setRes(resCode.BadRequest,false,'Business no longer available.Please contact Admin.',null))
				}
				else if (business.is_active == 0){
					res.send(setRes(resCode.BadRequest, false,'Please verify your business.',null))
				}
				else{
					bcrypt.compare(data.password, business.password, async function (err, result) {
						if (result == true) {
		
							const token =  jwt.sign({user: business.email}, 'secret', {expiresIn: 480 * 480})
							delete business.dataValues.auth_token
							business.dataValues.auth_token = token

							businessModel.update(
								{
									auth_token: token,
									// device_type: data.device_type,
									device_token: data.device_token,
									// device_id: data.device_id
								},
								{where: {id: business.id}
							})
							.then(async function (newBusiness) {
								if (newBusiness){

									//custome template url
									if(business.banner != null){

										var banner = await awsConfig.getSignUrl(business.banner).then(function(res){
											business.banner = res
										})
									}
									if(business.template != null){

										if(business.template.template_url != null){

											var template_url = await awsConfig.getSignUrl(business.template.image).then(function(res){
												business.template.template_url = res;
											})
										}
										if(business.template.image != null){

											var template_image = await awsConfig.getSignUrl(business.template.image).then(function(res){
												business.template.image = res;
											})
										}

									}

									res.send(setRes(resCode.OK, true, 'You are successfully logged in',business))
								}else{
									res.send(setRes(resCode.InternalServer, false, 'Token not updated',null))
								}
							})
		
						} else {
							res.send(setRes(resCode.BadRequest, false, "Invalid Email id or password",null))
						}
					});
				}
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer, false, "Internal Server Error",null))
		});
		}
		else{
			res.send(setRes(resCode.BadRequest, false, 'Invalid role.',null))
		}

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.GetProfileDetail = async (req, res) => {
	var data = req.body;
	var userModel = models.user
	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){
		userModel.findOne({
			where:{
				id: data.id,
				is_deleted:false
			}
		}).then(async user => {
			if (user != null){
				var profile_picture = await awsConfig.getSignUrl(user.profile_picture).then(function(res){
					user.profile_picture = res;
				});
				res.send(setRes(resCode.OK, true, "Get user profile successfully.",user))
			}
			else{
				res.send(setRes(resCode.ResourceNotFound, false, "User not Found.",null))
			}
		}).catch(userError => {
			res.send(setRes(resCode.InternalServer, false, "Fail to Get user Profile.",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.UpdateProfile = async (req, res) => {
	// console.log(req.file.originalname)
	// return
	var data = req.body
	req.file ? data.profile_picture = `${req.file.key}` : ''
	var userModel = models.user
	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){

		if(data.profile_picture){
		
			userModel.findOne({where:{id:data.id,is_deleted:false}}).then(userData =>{
				const params = {
							    Bucket: awsConfig.Bucket,
							    Key: userData.profile_picture
							};
				awsConfig.deleteImageAWS(params)
			})
		}

		userModel.update(data, {
			where: {
				id: data.id
			}
		}).then(user => {
			if (user == 1){
				res.send(setRes(resCode.OK, true, "User Profile Updated Successfully.",null))
			}
			else{
				res.send(setRes(resCode.BadRequest, false, "Fail to Update User Profile.",null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer, true, "Internal server error.",null))
		})

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.ChangePassword = async (req, res) => {
	var data = req.body
	var userModel = models.user
	var requiredFields = _.reject(['id','old_password','new_password','confirm_password'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){
		userModel.findOne({
			where:{
				id:data.id,
				is_deleted:false
			}
		}).then(user => {
			if (user != null){
				bcrypt.compare(data.old_password, user.password, function(error, isValid){
					if (!error && isValid == true){
						bcrypt.hash(data.new_password, 10).then(hash => {
							userModel.update({
								password:hash
							},{
								where:{
									id: data.id
								}
							}).then(updated => {
								if (updated == 1){
									res.send(setRes(resCode.OK, true, 'Password updated successfully.',null))
								}
								else{
									res.send(setRes(resCode.InternalServer, false, "Fail to update password.",null))
								}
							})
						})
					}
					else{
						res.send(setRes(resCode.BadRequest, false, "Old password not match.",null))
					}
				})
			}
			else{
				res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}
exports.SendOtp = async(req,res) => {
	var data = req.body
	var userModel = models.user

	var requiredFields = _.reject(['email'],(o) => { return _.has(data, o) })

	if(requiredFields == ''){
		res.send(setRes(resCode.BadRequest))
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}
exports.forgotPassword = async (req, res) => {
  var data = req.body
	var userModel = models.user
	var businessModel = models.business
		var emailOtpVerifieModel = models.email_otp_verifies

	var requiredFields = _.reject(['email','role'],(o) => { return _.has(data, o) })

	if(requiredFields == ''){
		if(data.role == 2){
			userModel.findOne({
				where:{
					email:data.email,
					role_id : data.role,
					is_deleted:false
				}
			}).then(user => {
	
				if(user != null){
	
					const otp = Math.floor(Math.random() * 9000) + 1000;
					
					var currentDate = new Date();
					var futureDate = new Date(currentDate.getTime() + commonConfig.email_otp_expired);
					var new_date = futureDate.toLocaleString('en-US', { timeZone: 'UTC' });
					var expire_at = moment(new_date).format('YYYY-MM-DD HH:mm:ss');
	
					emailOtpVerifieModel.create({user_id:user.id,email:data.email,otp:otp,role_id:data.role,expire_at:expire_at}).then( function (OtpData){
						
						if (OtpData) {
	
							var transporter = nodemailer.createTransport({
				  host: mailConfig.host,
				  port: mailConfig.port,
				  secure: mailConfig.secure,
				  auth: mailConfig.auth,
				  tls: mailConfig.tls
				})
	
				var templates = new EmailTemplates();
				var context = {
							  otp : otp,
							  username: user.username,
							  expire_at : expire_at
							}
							console.log(context)
							templates.render(path.join(__dirname, '../../', 'template', 'email-otp.html'), context, function (
								err,
				  html,
				  text,
				  subject
				){
								transporter.sendMail(
								{
									from: 'BioApz <do-not-reply@mail.com>',
									to: data.email,
									subject: 'Email OTP Verification',
					html: html
								},
								function (err, result) {
					if (err) {
							 console.log("--------------------------err------------")
							 console.log(err)
					} else {
							  console.log("--------------------------send res------------")
								console.log(result)
								res.send(setRes(resCode.OK, true,`Email has been sended to ${users.email}, with account activation instuction.. `,null));
					}
				  }
				  )
				})
			  }
			  data.otp = otp;
			  data.expire_at = expire_at;
						res.send(setRes(resCode.OK,true,'We have sent otp to your email address.',data))
						
					}).catch(err => {
							res.send(setRes(resCode.InternalServer, false, err.message,null))
					});
					
				}else{
					res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
				}
			})	
		}else if(data.role == 3){
			businessModel.findOne({
				where:{
					email:data.email,
					role_id : data.role,
					is_deleted:false
				}
			}).then(user => {
	
				if(user != null){
					
					const otp = Math.floor(Math.random() * 9000) + 1000;
					
					var currentDate = new Date();
					var futureDate = new Date(currentDate.getTime() + commonConfig.email_otp_expired);
					var new_date = futureDate.toLocaleString('en-US', { timeZone: 'UTC' });
					var expire_at = moment(new_date).format('YYYY-MM-DD HH:mm:ss');
					console.log(user.id);
					emailOtpVerifieModel.create({user_id:user.id,email:data.email,otp:otp,role_id:data.role,expire_at:expire_at}).then( function (OtpData){
						
						if (OtpData) {
	
							var transporter = nodemailer.createTransport({
				  host: mailConfig.host,
				  port: mailConfig.port,
				  secure: mailConfig.secure,
				  auth: mailConfig.auth,
				  tls: mailConfig.tls
				})
	
				var templates = new EmailTemplates();
				var context = {
							  otp : otp,
							  username: user.person_name,
							  expire_at : expire_at,
							  logo_image : `../../../public/logo.png`,
							}
							templates.render(path.join(__dirname, '../../', 'template', 'email-otp.html'), context, function (
								err,
				  html,
				  text,
				  subject
				){
								transporter.sendMail(
								{
									from: 'BioApz <do-not-reply@mail.com>',
									to: data.email,
									subject: 'Email OTP Verification',
					html: html
								},
								function (err, result) {
					if (err) {
							 console.log("--------------------------err------------")
							 console.log(err)
					} else {
							  console.log("--------------------------send res------------")
								console.log(result)
								res.send(setRes(resCode.OK, true,`Email has been sended to ${users.email}, with account activation instuction.. `,null));
					}
				  }
				  )
				})
			  }
			  data.otp = otp;
			  data.expire_at = expire_at;
						res.send(setRes(resCode.OK,true,'We have sent otp to your email address.',data))
						
					}).catch(err => {
							res.send(setRes(resCode.InternalServer, false, err.message,null))
					});
					
				}else{
					res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
				}
			})
		}else{
			res.send(setRes(resCode.ResourceNotFound, false, "Role Not Found",null))
		}
		
	}else{
		res.send(setRes(resCode.BadRequest, false,(requiredFields.toString() + ' are required'),null))
	}
  

}

exports.OtpVerify = async (req, res) => {

	var data = req.body
	var userModel = models.user
  var businessModel = models.business
  var emailOtpVerifieModel = models.email_otp_verifies

  var requiredFields = _.reject(['role','otp'], (o) => { return _.has(data, o)  })

  if(requiredFields == ""){

  	emailOtpVerifieModel.findOne({where:{otp:data.otp,role_id:data.role}}).then((otpUser) => {

  		if(otpUser != null){
  			
				var now_date_time = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
				var expire_time = moment(otpUser.expire_at).format('YYYY-MM-DD HH:mm:ss');
	
				if(now_date_time > expire_time){
					res.send(setRes(resCode.Unauthorized,false,"Your otp has been expired.",null));
				}else{
					
					if (data.role == 2){

						userModel.findOne({where: {email: otpUser.email, is_deleted: false}}).then(async (user) => {
							if (user == null){
								res.send(setRes(resCode.BadRequest, false, 'User not found.',null));
							}
							else{
								var response = await sendForgotPasswordMail(user, 2)
								if (response != ''){
									res.send(
										setRes(resCode.OK, true, 'An e-mail has been sent to given email address with further instructions.',null)
									  )
								}
								else{
									res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
								}
							}
						  })
						otpUser.destroy();
					}
					else if (data.role == 3){

						// check email is exist or not
						businessModel.findOne({where: {email: otpUser.email, is_deleted: false}}).then(async (business) => {
							if (business == null){
								res.send(setRes(resCode.BadRequest, false, 'User not found.',null));
							}
							else{
								var response = await sendForgotPasswordMail(business, 3)
								if (response != ''){
									res.send(
										setRes(resCode.OK, true, 'An e-mail has been sent to given email address with further instructions.',null)
									  )
								}
								else{
									res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
								}
							}
						  })

						otpUser.destroy();
					}
					else{
						res.send(setRes(resCode.BadRequest, false, 'Invalid role.',null))
					}
				}
  			
  		}else{
  			res.send(setRes(resCode.Unauthorized,false,"Invalid otp",null))
  		}
  	});
  }else{
  	res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
  }
}
function sendForgotPasswordMail(user, key){

	if (key == 2){
		var userModel = models.user
	}
	else if (key == 3){
		var userModel = models.business
	}
	

	return new Promise((resolve, reject) => {

		async.waterfall(
			[
			  function (callback) {
				crypto.randomBytes(20, function (err, buf) {
				  var token = buf.toString('hex')
				  console.log("=========fun1=======")
				  console.log(token)
				  callback(err, token)
				})
			  },
			  function (token, callback) {
				// user.resetPasswordToken = token
				// user.resetPasswordExpires = Date.now() + 3600000 // 1 hour
				console.log("===============fun2======")
				console.log(token)
	
				userModel.update({reset_pass_token: token, reset_pass_expire: Date.now() + 3600000},{where: {id: user.id}})
				.then(function (newUser) {
					
					if (newUser == 0){
						console.log("======newUser0====")	
						console.log(newUser)
						callback({err: "User not Updated"}, token)
					}else{
						console.log("======newUser1====")	
						console.log(newUser)
						callback(null, token)	
					}
				}).catch(function (updateUserError) {
					console.log("=========catch=======")
					console.log(updateUserError)
					callback(updateUserError)
				});
			  },
			  function (token, callback) {
				// send mail
				console.log("===============fun3======")
				console.log(token.toString())
	
				// return
				var transporter = nodemailer.createTransport({
				  host: mailConfig.host,
				  port: mailConfig.port,
				  secure: mailConfig.secure,
				  auth: mailConfig.auth,
				  tls: mailConfig.tls
				})
	
				// console.log("===========transporter=========")
				// console.log(transporter)
	
				var templates = new EmailTemplates()
				var context = {
				  resetUrl: commonConfig.app_url+'/api/user/resetPassword/' + token,
				  username: user.username
				// resetUrl: '#'
				}
	
				templates.render(path.join(__dirname, '../../', 'template', 'forgot-password.html'), context, function (
				  err,
				  html,
				  text,
				  subject
				) {
				//   console.log(html)
				  transporter.sendMail(
					{
					  from: 'BioApz <do-not-reply@mail.com>',
					//   to: 'abc@yopmail.com',
					to : user.email,
					//   cc: ['chintan.shah@technostacks.com', 'vishal@technostacks.com'],
					  subject: 'Reset Password',
					  html: html
					},
					function (err, result) {
					  if (err) {
						  console.log("--------------------------err------------")
						  console.log(err)
						callback(err)
					  } else {
						console.log("--------------------------send res------------")
						console.log(result)
						callback(result)
					  }
					}
				  )
				})
			  }
			],
			function (result) {
				console.log("================result==================")
				console.log(result)
			  if (!result) {
				resolve('')
			  } else {
				resolve(result)
			  }
			}
		  )

	})
}

exports.GetResetPasswordForm = async (req, res) => {
	var token = req.params.token
	var userModel = models.user
	var businessModel = models.business
	var Op = models.Op
  console.log(token)
  console.log(req.body)

  userModel.findOne({
	  where: {
		reset_pass_token: token, 
		reset_pass_expire: { [Op.gt]: Date.now() },
		is_deleted: 0 
	  }
  }).then(user => {

		if (user != null){
			  res.sendFile(path.join(__dirname, '../../template', 'reset-password.html'))
		}
		else{
			businessModel.findOne({
				where: {
					reset_pass_token: token, 
					reset_pass_expire: { [Op.gt]: Date.now() },
					is_deleted: 0 
				  }
			}).then(business => {
				if (business != null){
					  res.sendFile(path.join(__dirname, '../../template', 'reset-password.html'))
				}
				else{
					res.sendFile(path.join(__dirname, '../../template', '404.html'))
				}
			})
		}
  }).catch((GetUserError) => {
	res.send(setRes(resCode.ResourceNotFound, null, true, GetUserError.message))
  })
}

exports.UpdatePassword = function (req, res) {
  	var token = req.params.token
	var userModel = models.user
	var businessModel = models.business
	var Op = models.Op
  console.log(token)
  console.log(req.body)

  userModel.findOne({
	  where: {
		reset_pass_token: token, 
		reset_pass_expire: { [Op.gt]: Date.now() },
		is_deleted: 0 
	  }
  }).then(async user => {

		console.log(user)
		if (user != null){
			var password = await bcrypt.hash(req.body.new_password, 10)
			.then(hash => {
				return hash
			})
			
			userModel.update({
				reset_pass_token: null,
				reset_pass_expire: null,
				password: password
			},{
				where: {
					id: user.id
				}
			}).then(updateUser => {
				if (updateUser == 1){
					res.send(setRes(resCode.OK,true, "Password Updated Successfully.",user))
				}
				else{
					res.send(setRes(resCode.BadRequest, false, "Fail to Update Password.",null))		
				}
			}).catch(UpdateUserError => {
				res.send(setRes(resCode.ResourceNotFound, false, UpdateUserError.message,null))			
			})
		}
		else{
			businessModel.findOne({
				where: {
					reset_pass_token: token, 
					reset_pass_expire: { [Op.gt]: Date.now() },
					is_deleted: 0 
				  }
			}).then(async business => {
				if (business != null){

					var password = await bcrypt.hash(req.body.new_password, 10)
					.then(hash => {
						return hash
					})
					businessModel.update({
						reset_pass_token: null,
						reset_pass_expire: null,
						password: password
					},{
						where: {
							id: business.id
						}
					}).then(updateBusiness => {
						if (updateBusiness == 1){
							res.send(setRes(resCode.OK, true, "Password Updated Successfully.",business))
						}
						else{
							res.send(setRes(resCode.BadRequest, false, "Fail to Update Password.",null))		
						}
					}).catch(UpdateBusinessError => {
						res.send(setRes(resCode.ResourceNotFound, false, UpdateBusinessError.message,null))			
					})
				}
				else{
					res.send(setRes(resCode.BadRequest, false, "Fail to Update Password.",null))
				}
			}).catch(GetBusinessError => {
				res.send(setRes(resCode.ResourceNotFound,false, GetBusinessError.message,true))			
			})
		}
	
	//   res.sendFile(path.join(__dirname, '../../template', 'reset-password.html'))
	// res.send(setRes(resCode.OK, user, false, ""))
  }).catch((GetUserError) => {
	res.send(setRes(resCode.ResourceNotFound, false, GetUserError.message,null))
  })
}

exports.SendFeedback = async (req, res) => {
	var data = req.body
	var feedbackModel = models.feedback
	var userModel = models.user
	var businessModel = models.business
	console.log(data)

	var requiredFields = _.reject(['caption', 'message'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){

		if (data.user_id){

			userModel.findOne({
				where: {
					id: data.user_id,
					is_deleted: false,
				}
			}).then(async user => {
				if (user != null){
	
					var feedbackRes = await FeedbackMail(user, data)
					console.log('===========DATA=========')
					console.log(feedbackRes)

					if (feedbackRes == ''){
						res.send(setRes(resCode.BadRequest, false, "Fail to send feedback email.",null))
					}
					else{
						res.send(setRes(resCode.OK, true, "Your feedback has been sended to our team.",feedbackRes))
					}
	
				}
				else{
					res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
				}
			}).catch(getUserError => {
				res.send(setRes(resCode.InternalServer, false, getUserError.message,null))
			})

		}
		else if (data.business_id){

			businessModel.findOne({
				where: {
					id: data.business_id,
					is_deleted: false,
				}
			}).then(async business => {
				if (business != null){
	
					var feedbackRes = await FeedbackMail(business, data)

					if (feedbackRes == ''){
						res.send(setRes(resCode.BadRequest, false, "Fail to send feedback email.",null))
					}
					else{
						res.send(setRes(resCode.OK, true, "Your feedback has been sended to our team.",feedbackRes))
					}
	
				}
				else{
					res.send(setRes(resCode.ResourceNotFound,false, "User or Business not found.",null))
				}
			}).catch(getUserError => {
				res.send(setRes(resCode.InternalServer, false, getUserError.message,null))
			})

		}
		else {
			res.send(setRes(resCode.BadRequest, false, "business_id or user_id are required.",null))
		}

	}
	else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

function FeedbackMail(user, data){

	var feedbackModel = models.feedback

	return new Promise((resolve, reject) => {

		async.waterfall(
			[
			  function (callback) {
				var transporter = nodemailer.createTransport({
				  host: mailConfig.host,
				  port: mailConfig.port,
				  secure: mailConfig.secure,
				  auth: mailConfig.auth,
				  tls: mailConfig.tls
				})
	
				// console.log("===========transporter=========")
				// console.log(transporter)
	
				var templates = new EmailTemplates()
				var context = {
				  username: user.username || user.business_name,
				  caption: data.caption,
				  message: data.message
				}
	
				templates.render(path.join(__dirname, '../../', 'template', 'customer-feedback.html'), context, function (
				  err,
				  html,
				  text,
				  subject
				) {
				//   console.log(html)
				  transporter.sendMail(
					{
					  from: 'BioApz <do-not-reply@mail.com>',
					  to: 'bioapz@yopmail.com',
					  subject: 'Feedback From Customer',
					  html: html
					},
					function (err, result) {
					  if (err) {
						  console.log("--------------------------err------------")
						  console.log(err)
						callback(err)
					  } else {
						console.log("--------------------------send res------------")
						console.log(result)
						callback(result)
					  }
					}
				  )
				})
			  }
			],
			function (result) {
				console.log("================result==================")
				console.log(result)
			  if (!result) {
				resolve('')
				// res.send(setRes(resCode.BadRequest, null, true, "Fail to send feedback email."))
			  } else {
				
				feedbackModel.create(data).then(feedback => {
					resolve(JSON.parse(JSON.stringify(feedback)))
					// res.send(setRes(resCode.OK, feedback, false, "Your feedback has been sended to our team."))
				}).catch(saveFeedbackError => {
					resolve('')
					// res.send(setRes(resCode.InternalServer, null, true, saveFeedbackError.message))
				})

			  }
			}
		  )

	})
}

exports.GetAllBusiness = async (req, res) => {

	var data = req.body
	var businessModel = models.business
	var businesscateogryModel = models.business_categorys

	var requiredFields = _.reject(['page', 'page_size'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}

		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)

		var condition = {
			include: {
				model: businesscateogryModel,
				attributes: ['name'] 
			},
			offset:skip,
			limit:limit,
			order: [
				['createdAt', 'DESC']
			],
			attributes: { exclude: ['is_deleted', 'is_enable','auth_token','device_type',
				'role_id','sections','template_id','color_code','approve_by',
				'booking_facility','abn_no','address','password','account_name','person_name',
				'reset_pass_token','reset_pass_expire','device_token','business_category','account_number',
				'latitude','longitude','email','device_id','phone'] }
		}

		if(data.category_id){
			condition.where = {category_id:data.category_id,is_deleted:false,is_active:true}
		}else{
			condition.where = {is_deleted:false,is_active:true}
		}
		businessModel.findAll(condition).then(async businessData => {

			if(businessData.length > 0){

				for(const data of businessData){
					
					data.dataValues.category_name = data.business_category.name
					delete data.dataValues.business_category;
					if(data.banner != null){

						const signurl = await awsConfig.getSignUrl(data.banner).then(function(res){
							data.banner = res
						})
					}else{
						data.banner = commonConfig.app_url+'/public/defualt.png'
					}
				}
				res.send(setRes(resCode.OK,true,'Get Business successfully',businessData))
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,'Business not found',null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,false,"Fail to get business",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}