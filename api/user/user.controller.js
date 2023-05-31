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
const { verifyToken } = require('../../config/token')
const Sequelize = require('sequelize');

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
		data.email = (data.email).toLowerCase();
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
						res.send(setRes(resCode.OK, true,`Email has been sent to ${(users.email).toLowerCase()}, with account activation instuction.. `,true));
                  }
                }
              )
            })

			  res.send(setRes(resCode.OK,true, `Email has been sent to ${(users.email).toLowerCase()}, with account activation instuction.. `, null));
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
					if (user.is_deleted == 1 && user.is_active == 0){
						res.send(setRes(resCode.BadRequest, false,'User not register.',null))
					}
					else if (user.is_active == 0){
						res.send(setRes(resCode.BadRequest, false ,'Please verify your account.',null))
					}
					else{
						bcrypt.compare(data.password, user.password, async function (err, result) {
							if (result == true) {

								const token =  jwt.sign({id:user.id,user: user.email,role_id:user.role_id}, 'secret', {expiresIn: 480 * 480})
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
										else{
											user.profile_picture = commonConfig.default_user_image;
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
				include: [
					// templateModel, 
					categoryModel]
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
		
							const token =  jwt.sign({id:business.id,user: business.email,role_id:business.role_id}, 'secret', {expiresIn: 480 * 480})
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
									// if(business.template != null){

									// 	if(business.template.template_url != null){

									// 		var template_url = await awsConfig.getSignUrl(business.template.image).then(function(res){
									// 			business.template.template_url = res;
									// 		})
									// 	}
									// 	if(business.template.image != null){

									// 		var template_image = await awsConfig.getSignUrl(business.template.image).then(function(res){
									// 			business.template.image = res;
									// 		})
									// 	}

									// }

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
			console.log(user)
			if (user != null){
				if(user.profile_picture != null){

					var profile_picture = await awsConfig.getSignUrl(user.profile_picture).then(function(res){
						user.profile_picture = res;
					});
				}else{
					user.profile_picture = commonConfig.default_user_image;
				}
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
		userModel.findOne({
			where:{
				id:data.id,
				is_deleted:false,
				is_active:true
			}
		}).then(async user => {
			if(_.isEmpty(user)){
				res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
			}else{
				userModel.update(data, {
					where: {
						id: data.id
					}
				}).then(async user => {
					if (user == 1){
						userModel.findOne({
							where:{
								id:data.id,
								is_deleted:false,
								is_active:true
							}
						}).then(async userData => {
							if(userData.profile_picture != null){

								var banner = await awsConfig.getSignUrl(userData.profile_picture).then(function(res){
									userData.profile_picture = res
								})
							}
							else{
								userData.profile_picture = commonConfig.default_user_image;
							}
							res.send(setRes(resCode.OK, true, "User Profile Updated Successfully.",userData))
						})
						
					}
					else{
						res.send(setRes(resCode.BadRequest, false, "Fail to Update User Profile.",null))
					}
				}).catch(error => {
					res.send(setRes(resCode.InternalServer, true, "Internal server error.",null))
				})
			}
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
					// var new_date = futureDate.toLocaleString('en-US', { timeZone: 'UTC' });
					var expire_at = moment.utc(futureDate).format('YYYY-MM-DD HH:mm:ss');
	
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
								res.send(setRes(resCode.OK, true,`Email has been sent to ${users.email}, with account activation instuction.. `,null));
					}
				  }
				  )
				})
			  }
			  data.otp = otp;
			  data.otp_valid_till = moment.utc(commonConfig.email_otp_expired).format("mm:ss")
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
					// var new_date = futureDate.toLocaleString('en-US', { timeZone: 'UTC' });
					var expire_at = moment.utc(futureDate).format('YYYY-MM-DD HH:mm:ss');
					console.log(expire_at);
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
								res.send(setRes(resCode.OK, true,`Email has been sent to ${users.email}, with account activation instuction.. `,null));
					}
				  }
				  )
				})
			  }
			  data.otp = otp;
			  data.otp_valid_till = moment.utc(commonConfig.email_otp_expired).format("mm:ss")
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
  			res.send(setRes(resCode.BadRequest,false,"Please enter valid OTP.",null))
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

	var data = req.query;
	var businessModel = models.business
	var Op = models.Op;
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
		if(data.search && data.search != null){
			condition.where = {[Op.or]: [{business_name: {[Op.like]: "%" + data.search + "%",}}],}
		}
		
		businessModel.findAll(condition).then(async businessData => {

			if(businessData.length > 0){

				for(const data of businessData){

					if (data.business_category != null) {
						data.dataValues.category_name = data.business_category.name;
						delete data.dataValues.business_category;
					  } else {
						data.dataValues.category_name = "";
					  }
					if(data.banner != null){

						const signurl = await awsConfig.getSignUrl(data.banner).then(function(res){
							data.banner = res
						})
					}else{
						data.banner = commonConfig.default_image;
					}
				}
				res.send(setRes(resCode.OK,true,'Get Business successfully',businessData))
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,'Business not found',null))
			}
		}).catch(error => {
			console.log(error)
			res.send(setRes(resCode.InternalServer,false,"Fail to get business",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.Logout = async (req, res) => {
	try{
		const authHeader = req.headers["authorization"];
		var userModel = models.user
		var businessModel = models.business
		const TokenData =  jwt.verify(authHeader, 'secret', {expiresIn: 480 * 480})
		var roleId = TokenData.role_id
		
		if (roleId == 2){
			userModel.findOne({
				where:{
					id : TokenData.id
				}
			}).then(async user =>{
				if(user){
					const token =  jwt.sign({id:user.id,user: user.email,role_id:user.role_id}, 'secret', {expiresIn: 480 * 480})
					delete user.dataValues.auth_token
					user.dataValues.auth_token = token
					userModel.update(
						{auth_token: token,},
						{where: {id: user.id}
					})
					.then(async function (newUser) {
						if(newUser){
							res.send(setRes(resCode.OK,true,'Logout successfully',null))
						}else{
							res.send(setRes(resCode.BadRequest, false, "Can't logged out.",null))
						}
					})
				}else{
					res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
				}
			})
		}else if(roleId == 3){
			businessModel.findOne({
				where:{
					id : TokenData.id
				}
			}).then(async user =>{
				if(user){
					const token =  jwt.sign({id:user.id,user: user.email,role_id:user.role_id}, 'secret', {expiresIn: 480 * 480})
					delete user.dataValues.auth_token
					user.dataValues.auth_token = token
					businessModel.update(
						{auth_token: token,},
						{where: {id: user.id}
					})
					.then(async function (newUser) {
						if(newUser){
							res.send(setRes(resCode.OK,true,'Logout successfully',null))
						}else{
							res.send(setRes(resCode.BadRequest, false, "Can't logged out.",null))
						}
					})
				}else{
					res.send(setRes(resCode.ResourceNotFound, false, "Business not found.",null))
				}
			})
		}else{
			res.send(setRes(resCode.BadRequest, false, 'Invalid role.',null))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

// Home Screeen Details START
exports.homeList = async (req, res) => {
	try {
		var data = req.body;
		var businessModel = models.business;
		var Op = models.Op;
		var currentDate = moment().format('YYYY-MM-DD');
		var giftCardModel = models.gift_cards
		var cashbackModel = models.cashbacks
		var discountModel = models.discounts
		var couponeModel = models.coupones
		var loyaltyPointModel = models.loyalty_points
		var combocalenderModel = models.combo_calendar
		var responseData = [];
		var businessArray = [];
		var eventArray = [];
		const promises = [];

		businessArray.push(
			businessModel.findAll({
				where: { is_deleted: false, is_active: true }
			}).then(async business => {
				if(business.length > 0){
					const dataArray = [];
					for (const data of business) {
						if (data.banner != null) {
							const signurl = await awsConfig.getSignUrl(data.banner).then(function (res) {
								data.banner = res;
							});
						} else {
							data.banner = commonConfig.default_user_image;
						}
					}
					var array = shuffle(business);
					var slicedArray = array.slice(0, 5);
					let result = 	JSON.parse(JSON.stringify(slicedArray));
					dataArray.push(result);
					return result;
				}
				return [];
			})
		);
		
		const [businessData] = await Promise.all(businessArray);
		const businessDataArray = businessData;

		promises.push(
			giftCardModel.findAll({
				where:{isDeleted:false,status:true,deleted_at: null,expire_at: { 
					[Op.gt]: currentDate
				  },}
			}).then(async giftCardData => {
				if (giftCardData.length > 0){
					const dataArray = [];
					// Update Sign URL
					for(const data of giftCardData){
						if(data.image != null){
							var images = data.image
							const signurl = await awsConfig.getSignUrl(images.toString()).then(function(res){
								data.image = res;
							});
						}else {
							data.image = commonConfig.default_image;
						}
						let result = 	JSON.parse(JSON.stringify(data));
						result.type="gift_cards";
						dataArray.push(result);
					}
					return dataArray;
				}
				return [];
			}),
			cashbackModel.findAll({
				where:{isDeleted:false,status:true,deleted_at: null,validity_for: { 
					[Op.gt]: currentDate
				},}
			}).then(async CashbackData => {
				if (CashbackData.length > 0){
					const dataArray = [];
					for(const data of CashbackData){
					let result = 	JSON.parse(JSON.stringify(data));
					result.type="cashbacks";
					dataArray.push(result);
					}
					return dataArray;
				}
				return [];		
			}),
			discountModel.findAll({
				where:{isDeleted:false,status:true,deleted_at: null,validity_for: { 
					[Op.gt]: currentDate
				},}
			}).then(async DiscountData => {
					if (DiscountData.length > 0){
						const dataArray = [];
						for(const data of DiscountData){
							let result = 	JSON.parse(JSON.stringify(data));
							result.type="discounts";
							dataArray.push(result);
							}
							return dataArray;
					}
				return [];
			}),
			couponeModel.findAll({
				where:{isDeleted:false,status:true,deleted_at: null,expire_at: { 
					[Op.gt]: currentDate
				},}
			}).then(async CouponeData => {
				if (CouponeData.length > 0){
					const dataArray = [];
					for(const data of CouponeData){
					let result = 	JSON.parse(JSON.stringify(data));
					result.type="coupones";
					dataArray.push(result);
					}
					return dataArray;
					
				}
				return [];
			}),
			loyaltyPointModel.findAll({
				where:{isDeleted:false,status:true,deleted_at: null,validity: { 
					[Op.gt]: currentDate
				},}
			}).then(async LoyaltyPointData => {
				if (LoyaltyPointData.length > 0){
					const dataArray = [];
					for(const data of LoyaltyPointData){
					let result = 	JSON.parse(JSON.stringify(data));
					result.type="loyalty_points";
					dataArray.push(result);
					}
					return dataArray;
					
				}
				return [];
			}),
		);
		const [giftcardRewards,cashbackData,discountData,couponeData,loyaltyData] = await Promise.all(promises);
		const rewardsAndLoyaltyArray = [giftcardRewards, cashbackData,discountData,couponeData,loyaltyData];
		const mergedArray = mergeRandomArrayObjects(rewardsAndLoyaltyArray);
		let result =  mergedArray.slice(0, 5);
		// console.log(result)

		eventArray.push(
			combocalenderModel.findAll({
				where: { is_deleted: false ,end_date: { 
					[Op.lt]: currentDate
				  },}
			}).then(async event => {
				if(event.length > 0){
					const dataArray = [];	
					for (const data of event) {
						var event_images = data.images
						var image_array = [];
						if(event_images != null){
							for(const data of event_images){
								const signurl = await awsConfig.getSignUrl(data).then(function(res){
									  image_array.push(res);
								});
							}
						}else{
							image_array.push(commonConfig.default_image)
						}
						data.dataValues.event_images = image_array
					}
					var array = shuffle(event);
					var slicedArray = array.slice(0, 5);
					let result = 	JSON.parse(JSON.stringify(slicedArray));
					dataArray.push(result);
					return result;
				}
				return [];
			})
		);
		
		const [eventsData] = await Promise.all(eventArray);
		const eventDataArray = eventsData;

		let resData = {};
		resData.businesses = businessDataArray;
		resData.rewards_and_loyalty = mergedArray;
		resData.upcoming_events = eventDataArray;

		res.send(setRes(resCode.OK, true, "Get rewards list successfully.",resData))
	} catch(error){
		console.log(error)
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

function shuffle(array) {
  let currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {

    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}
// Home Screeen Details END
// =========================================Online STORE START=========================================
// Rewards List START
exports.rewardsList = async (req, res) => {
	try{
		var data = req.body
		var giftCardModel = models.gift_cards
		var cashbackModel = models.cashbacks
		var discountModel = models.discounts
		var couponeModel = models.coupones
		var Op = models.Op
		const promises = [];
		var requiredFields = _.reject(['business_id','page','page_size'], (o) => { return _.has(data, o)  })

		if(requiredFields == ""){
			if(data.page < 0 || data.page == 0) {
				return res.send(setRes(resCode.BadRequest, null, false, "invalid page number, should start with 1"))
			}

			let skip = data.page_size * (data.page - 1);
			let limit = parseInt(data.page_size);
			var currentDate = (moment().format('YYYY-MM-DD'))
			
			promises.push(
				giftCardModel.findAll({
					where:{isDeleted:false,status:true,deleted_at: null,expire_at: { 
						[Op.gt]: currentDate
					  },}
				}).then(async giftCardData => {
					if (giftCardData.length > 0){
						const dataArray = [];
						// Update Sign URL
						for(const data of giftCardData){
							if(data.image != null){
								var images = data.image
								const signurl = await awsConfig.getSignUrl(images.toString()).then(function(res){
									data.image = res;
								});
							}else {
								data.image = commonConfig.default_image;
							}
							let result = 	JSON.parse(JSON.stringify(data));
							result.type="gift_cards";
							dataArray.push(result);
						}
						return dataArray;
					}
					return [];
				}),
				cashbackModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,validity_for: { 
						[Op.gt]: currentDate
					},}
				}).then(async CashbackData => {
					if (CashbackData.length > 0){
						const dataArray = [];
						for(const data of CashbackData){
						let result = 	JSON.parse(JSON.stringify(data));
						result.type="cashbacks";
						dataArray.push(result);
						}
						return dataArray;
					}
					return [];		
				}),
				discountModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,validity_for: { 
						[Op.gt]: currentDate
					},}
				}).then(async DiscountData => {
						if (DiscountData.length > 0){
							const dataArray = [];
							for(const data of DiscountData){
								let result = 	JSON.parse(JSON.stringify(data));
								result.type="discounts";
								dataArray.push(result);
								}
								return dataArray;
						}
					return [];
				}),
				couponeModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,expire_at: { 
						[Op.gt]: currentDate
					},}
				}).then(async CouponeData => {
					if (CouponeData.length > 0){
						const dataArray = [];
						for(const data of CouponeData){
						let result = 	JSON.parse(JSON.stringify(data));
						result.type="coupones";
						dataArray.push(result);
						}
						return dataArray;
						
					}
					return [];
				}),
			);

			const [giftcardRewards,cashbackData,discountData,couponeData] = await Promise.all(promises);

			const arrays = [giftcardRewards, cashbackData,discountData,couponeData];
			const mergedArray = mergeRandomArrayObjects(arrays);
			let result =  mergedArray.slice(skip, skip+limit);
			res.send(setRes(resCode.OK, true, "Get rewards list successfully.",result))
		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

function mergeRandomArrayObjects(arrays) {
	const shuffledArrays = _.shuffle(arrays);
	const mergedArray = [];
  
	_.each(shuffledArrays, function(array) {
	  _.each(array, function(obj) {
		_.extend(obj, { random: Math.random() });
		mergedArray.push(obj);
	  });
	});
	return mergedArray;
}
// Rewards List END

// Rewards View START
exports.rewardsView = async (req, res) => {
	try{
		var data = req.params
		var paramType = req.query.type
		var giftCardModel = models.gift_cards
		var cashbackModel = models.cashbacks
		var discountModel = models.discounts
		var couponeModel = models.coupones
		var Op = models.Op
		var currentDate = (moment().format('YYYY-MM-DD'))

		var typeArr = ['gift_cards','cashbacks','discounts','coupones'];
		if((paramType) && !(typeArr.includes(paramType))){
			return res.send(setRes(resCode.BadRequest, null, false, "Please select valid type."))
		}else{
			if(paramType == 'gift_cards') {
				giftCardModel.findOne({
					where:{
						id:data.id,
						status:true,
						isDeleted:false,
						expire_at: { 
							[Op.gt]: currentDate
						},
					}
				}).then(async giftCardData => {
					if (giftCardData != null){
						if(giftCardData.image != null){
							var giftCardData_image = await awsConfig.getSignUrl(giftCardData.image).then(function(res){
								giftCardData.image = res;
							})
						}else{
							giftCardData.image = commonConfig.default_image;
						}
						res.send(setRes(resCode.OK, true, "Get gift card detail successfully.",giftCardData))
					}
					else{
						res.send(setRes(resCode.ResourceNotFound,false, "Gift card not found.",null))
					}
				}).catch(error2 => {
					res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
				})
			
			}else if(paramType == 'cashbacks') {
				cashbackModel.findOne({
					where:{id:data.id,status:true,isDeleted:false,validity_for: { 
						[Op.gt]: currentDate
					},}
				}).then(async cashbackData => {
					if (cashbackData != null){
						res.send(setRes(resCode.OK, true, "Get cashbacks detail successfully.",cashbackData))
					}
					else{
						res.send(setRes(resCode.ResourceNotFound,false, "Cashback not found.",null))
					}
				}).catch(error3 => {
					res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
				})
			}else if(paramType == 'discounts'){
				discountModel.findOne({
					where:{id:data.id,status:true,isDeleted:false,deleted_at:null,validity_for: { 
						[Op.gt]: currentDate
					},}
				}).then(async discountData => {
					if (discountData != null){
						res.send(setRes(resCode.OK, true, "Get Discount detail successfully.",discountData))
					}
					else{
						res.send(setRes(resCode.ResourceNotFound,false, "Discount not found.",null))
					}
				}).catch(error4 => {
					res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
				})
			}else if(paramType == 'coupones'){
				couponeModel.findOne({
					where:{id:data.id,status:true,isDeleted:false,deleted_at:null,expire_at: { 
						[Op.gt]: currentDate
					},}
				}).then(async couponeData => {
					if (couponeData != null){
						res.send(setRes(resCode.OK, true, "Get Coupones detail successfully.",couponeData))
					}
					else{
						res.send(setRes(resCode.ResourceNotFound,false, "Coupon not found.",null))
					}
				}).catch(error5 => {
					res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
				})
			}else {
				res.send(setRes(resCode.BadRequest, null, false, "Please select valid type."))
			}
		}
		
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

// Rewards View END

// Loyalty List START
exports.loyaltyList = async (req, res) => {
  try {
    var data = req.body;
    var loyaltyPointModel = models.loyalty_points;
    var businessModel = models.business;
    var productModel = models.products;
    const Op = models.Op;
	var currentDate = (moment().format('YYYY-MM-DD'))
    var requiredFields = _.reject(["business_id", "page", "page_size"], (o) => {
      return _.has(data, o);
    });
    if (requiredFields == "") {
      if (data.page < 0 || data.page == 0) {
        return res.send(
          setRes(
            resCode.BadRequest,
            null,
            false,
            "invalid page number, should start with 1"
          )
        );
      }

      let skip = data.page_size * (data.page - 1);
      let limit = parseInt(data.page_size);

      loyaltyPointModel
        .findAll({
          where: {
            isDeleted: false,
            status: true,
            business_id: data.business_id,
            deleted_at: null,
			validity: { 
				[Op.gt]: currentDate
			},
          },
          include: [
            {
              model: businessModel,
              attributes: ["id", "business_name"],
            },
            {
              model: productModel,
              attributes: ["id", "name"],
            },
          ],
        })
        .then(async (loyaltyData) => {
          if (loyaltyData.length > 0) {
            for (const data of loyaltyData) {

              // Get businesss name
              if (data.business != null) {
                data.dataValues.business_name = data.business.business_name;
                delete data.dataValues.business;
              } else {
                data.dataValues.business_name = "";
              }
              // Get products name
              if (data.product != null) {
                data.dataValues.product_name = data.product.name;
                delete data.dataValues.product;
              } else {
                data.dataValues.product_name = "";
              }
            }
            res.send(
              setRes(
                resCode.OK,
                true,
                "Get loyalty list successfully",
                loyaltyData
              )
            );
          } else {
            res.send(
              setRes(resCode.ResourceNotFound, false, "Loyalty not found", null)
            );
          }
        });
    } else {
      res.send(
        setRes(
          resCode.BadRequest,
          false,
          requiredFields.toString() + " are required",
          null
        )
      );
    }
  } catch (error) {
    console.log(error);
    res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null));
  }
};
// Loyalty List END

// Loyalty View START
exports.loyaltyView = async (req, res) => {
	try {
	  var data = req.params;
	  var loyaltyPointModel = models.loyalty_points;
	  var businessModel = models.business;
	  var productModel = models.products;
	  const Op = models.Op;

	  var currentDate = (moment().format('YYYY-MM-DD'))
		  loyaltyPointModel.findOne({
			where: {
			  isDeleted: false,
			  status: true,
			  id: data.id,
			  deleted_at: null,
			  validity: { 
				  [Op.gt]: currentDate
			  },
			},
			include: [
			  {
				model: businessModel,
				attributes: ["id", "business_name"],
			  },
			  {
				model: productModel,
				attributes: ["id", "name"],
			  },
			],
		  })
		  .then(async (loyaltyData) => {
			if (loyaltyData) {
			  res.send(
				setRes(
				  resCode.OK,
				  true,
				  "Get loyalty point details successfully",
				  loyaltyData
				)
			  );
			} else {
			  res.send(
				setRes(resCode.ResourceNotFound, false, "Loyalty not found", null)
			  );
			}
		  });
	} catch (error) {
	  console.log(error);
	  res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null));
	}
  };
  // Loyalty List END

// Business BIO START
exports.businessBIO = async (req, res) => {
  var data = req.query;
  var businessModel = models.business;
  var businessCategory = models.business_categorys
  var cmsModels = models.cms_pages
  var settingModel = models.settings
  var faqModel = models.faqs
  businessModel
    .findOne({
      where: { id: data.business_id, is_active: true, is_deleted: false },
	  attributes: ['id', 'business_name','description'], 
	  include: [
		{
			model: businessCategory,
			attributes: ['id','name'],
			where: {is_deleted:false}
		},
		{
			model: settingModel,
			attributes:['id','setting_value']
		},
		{
			model: cmsModels,
			attributes:['id','page_value','page_label'],
			where: {page_key:'terms_of_service'},		
		},
		{
			model: faqModel,
			attributes: ['id','title','description']
		}
	  ],
    })
    .then(async (bio) => {
		if (bio != null) {
			//  Category name Get
			if (bio.business_category != null) {
				bio.dataValues.business_category_name = bio.business_category.name;
				delete bio.dataValues.business_category;
			} else {
				bio.dataValues.business_category_name = "";
			}

			// FAQ Details
			if (bio.faq != null) {
				bio.dataValues.faq = bio.faq.description;
			} else {
				bio.dataValues.faq = "";
			}

			//  Opening Time
			if (bio.setting != null) {
				var date =  bio.setting.setting_value
				var arr1 = date.split('_');
				var from = moment(arr1[0], "HH:mm").format("hh:mm A");
				var to = moment(arr1[1], "HH:mm").format("hh:mm A");
				bio.dataValues.available = `${from} - ${to}`;
				delete bio.dataValues.setting;
			} else {
				bio.dataValues.available = "";
			}

			// Terms And Conditions GET
			if (bio.cms_page != null) {
				bio.dataValues.terms_and_condition = bio.cms_page.page_value;
				delete bio.dataValues.cms_page;
			} else {
				bio.dataValues.terms_and_condition = "";
			}
			
			res.send(
				setRes(
					resCode.OK,
					true,
					"Get bussiness bio detail successfully.",
					bio
				)
			);
		} else {
			res.send(
				setRes(resCode.ResourceNotFound, false, "Bussiness not found.", null)
			);
		}
    });
};
// Business BIO END
// =========================================Online STORE END=========================================