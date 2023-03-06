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
 
 console.log(req.body)
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
			  resetUrl: 'http://18.211.184.240:5000/api/user/account-activation/' + token,
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
						res.send(setRes(resCode.OK, `Email has been sended to ${users.email}, with account activation instuction.. `, false, ''));
                  }
                }
              )
            })

			  res.send(setRes(resCode.OK, `Email has been sended to ${users.email}, with account activation instuction.. `, false, ''));
          } else {
              res.send(setRes(resCode.BadRequest, null, true, 'user registration fail'));
          }
		})
		.catch(err => {
			res.send(setRes(resCode.InternalServer, null, true, err.message))
		});
      }
      else{
        res.send(setRes(resCode.BadRequest, null, true, 'User already exist'));
      }
    }).catch(error => {
		res.send(setRes(resCode.InternalServer, null, true, error))
	})
    

  }else{
    res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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

	console.log(req.body)
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
					res.send(setRes(resCode.BadRequest, null, true ,'User not found.'))
				} else {
					if (user.is_deleted == 1){
						res.send(setRes(resCode.BadRequest, null, true ,'User no longer available.'))
					}
					else if (user.is_active == 0){
						res.send(setRes(resCode.BadRequest, null, true ,'Please verify your account.'))
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

											user.profile_picture = awsConfig.getSignUrl(user.profile_picture)
										}
										res.send(setRes(resCode.OK, user, false, 'You are successfully logged in'))
									}else{
										res.send(setRes(resCode.InternalServer, null, false, 'Token not updated'))
									}
								})

							} else {
								res.send(setRes(resCode.Unauthorized, null, true, "Invalid Email id or password"))
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
				res.send(setRes(resCode.BadRequest, null, true ,'Business not found..'))
			} else {
				if (business.is_deleted == 1){
					res.send(setRes(resCode.BadRequest, null, true ,'Business no longer available.Please contact Admin.'))
				}
				else if (business.is_active == 0){
					res.send(setRes(resCode.BadRequest, null, true ,'Please verify your business.'))
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
							.then(function (newBusiness) {
								if (newBusiness){

									//custome template url
									if(business.banner != null){

										business.banner = awsConfig.getSignUrl(business.banner)
									}
									if(business.template != null){

										if(business.template.template_url != null){

											business.template.template_url = awsConfig.getSignUrl('templates_thumb/'+business.template.image)
										}
										if(business.template.image != null){

											business.template.image = awsConfig.getSignUrl('templates_thumb/'+business.template.image)
										}

									}

									res.send(setRes(resCode.OK, business, false, 'You are successfully logged in'))
								}else{
									res.send(setRes(resCode.InternalServer, null, false, 'Token not updated'))
								}
							})
		
						} else {
							res.send(setRes(resCode.Unauthorized, null, true, "Invalid Email id or password"))
						}
					});
				}
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer, null, true, "Internal Server Error"))
		});
		}
		else{
			res.send(setRes(resCode.BadRequest, null, true, 'Invalid role.'))
		}

	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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
		}).then(user => {
			if (user != null){
				user.profile_picture = awsConfig.getSignUrl(user.profile_picture);
				res.send(setRes(resCode.OK, user, false, "Get user profile successfully."))
			}
			else{
				res.send(setRes(resCode.ResourceNotFound, user, true, "User not Found."))
			}
		}).catch(userError => {
			res.send(setRes(resCode.InternalServer, null, true, "Fail to Get user Profile."))
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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
							    Bucket: 'bioapz',
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
				res.send(setRes(resCode.OK, null, false, "User Profile Updated Successfully."))
			}
			else{
				res.send(setRes(resCode.BadRequest, null, true, "Fail to Update User Profile."))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
		})

	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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
									res.send(setRes(resCode.OK, null, false, 'Password updated successfully.'))
								}
								else{
									res.send(setRes(resCode.InternalServer, null, true, "Fail to update password."))
								}
							})
						})
					}
					else{
						res.send(setRes(resCode.BadRequest, null, true, "Old password not match."))
					}
				})
			}
			else{
				res.send(setRes(resCode.ResourceNotFound, null, true, "User not found."))
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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
	var emailOtpVerifieModel = models.email_otp_verifies

	var requiredFields = _.reject(['email','role'],(o) => { return _.has(data, o) })

	if(requiredFields == ''){
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
					        res.send(setRes(resCode.OK, `Email has been sended to ${users.email}, with account activation instuction.. `, false, ''));
                }
              }
              )
            })
          }
          data.otp = otp;
          data.expire_at = expire_at;
					res.send(setRes(resCode.OK,data,false,'We have sent otp to your email address.'))
					
				}).catch(err => {
						res.send(setRes(resCode.InternalServer, null, true, err.message))
				});
				
			}else{
				res.send(setRes(resCode.ResourceNotFound, null, true, "User not found."))
			}
		})
		
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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
					res.send(setRes(resCode.OK,null,false,"Your otp has been expired."));
				}else{
					
					if (data.role == 2){

						userModel.findOne({where: {email: otpUser.email, is_deleted: false}}).then(async (user) => {
							if (user == null){
								res.send(setRes(resCode.BadRequest, null, true, 'User not found.'));
							}
							else{
								var response = await sendForgotPasswordMail(user, 2)
								if (response != ''){
									res.send(
										setRes(resCode.OK, null, false, 'An e-mail has been sent to given email address with further instructions.')
									  )
								}
								else{
									res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
								}
							}
						  })
						otpUser.destroy();
					}
					else if (data.role == 3){

						// check email is exist or not
						businessModel.findOne({where: {email: otpUser.email, is_deleted: false}}).then(async (business) => {
							if (business == null){
								res.send(setRes(resCode.BadRequest, null, true, 'User not found.'));
							}
							else{
								var response = await sendForgotPasswordMail(business, 3)
								if (response != ''){
									res.send(
										setRes(resCode.OK, null, false, 'An e-mail has been sent to given email address with further instructions.')
									  )
								}
								else{
									res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
								}
							}
						  })

						otpUser.destroy();
					}
					else{
						res.send(setRes(resCode.BadRequest, null, true, 'Invalid role.'))
					}
				}
  			
  		}else{
  			res.send(setRes(resCode.OK,null,false,"Invalid otp"))
  		}
  	});
  }else{
  	res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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
				  resetUrl: 'http://18.211.184.240:5000/api/user/resetPassword/' + token,
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
					res.send(setRes(resCode.OK, user, false, "Password Updated Successfully."))
				}
				else{
					res.send(setRes(resCode.BadRequest, null, true, "Fail to Update Password."))		
				}
			}).catch(UpdateUserError => {
				res.send(setRes(resCode.ResourceNotFound, 1, true, UpdateUserError.message))			
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
							res.send(setRes(resCode.OK, business, false, "Password Updated Successfully."))
						}
						else{
							res.send(setRes(resCode.BadRequest, null, true, "Fail to Update Password."))		
						}
					}).catch(UpdateBusinessError => {
						res.send(setRes(resCode.ResourceNotFound, 2, true, UpdateBusinessError.message))			
					})
				}
				else{
					res.send(setRes(resCode.BadRequest, null, true, "Fail to Update Password."))
				}
			}).catch(GetBusinessError => {
				res.send(setRes(resCode.ResourceNotFound, 3, true, GetBusinessError.message))			
			})
		}
	
	//   res.sendFile(path.join(__dirname, '../../template', 'reset-password.html'))
	// res.send(setRes(resCode.OK, user, false, ""))
  }).catch((GetUserError) => {
	res.send(setRes(resCode.ResourceNotFound, 4, true, GetUserError.message))
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
						res.send(setRes(resCode.BadRequest, null, true, "Fail to send feedback email."))
					}
					else{
						res.send(setRes(resCode.OK, feedbackRes, false, "Your feedback has been sended to our team."))
					}
	
				}
				else{
					res.send(setRes(resCode.ResourceNotFound, null, true, "User not found."))
				}
			}).catch(getUserError => {
				res.send(setRes(resCode.InternalServer, null, true, getUserError.message))
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
						res.send(setRes(resCode.BadRequest, null, true, "Fail to send feedback email."))
					}
					else{
						res.send(setRes(resCode.OK, feedbackRes, false, "Your feedback has been sended to our team."))
					}
	
				}
				else{
					res.send(setRes(resCode.ResourceNotFound, null, true, "User or Business not found."))
				}
			}).catch(getUserError => {
				res.send(setRes(resCode.InternalServer, null, true, getUserError.message))
			})

		}
		else {
			res.send(setRes(resCode.BadRequest, null, true, "business_id or user_id are required."))
		}

	}
	else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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