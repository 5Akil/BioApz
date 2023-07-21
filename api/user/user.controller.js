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
const { model } = require('mongoose')
const { error } = require('console')
const pagination = require('../../helpers/pagination');

exports.Register = async (req, res) => {

  var data = req.body
  req.file ? data.profile_picture = `${req.file.key}`: '';
  var dbModel = models.user;
  var Op = models.Op

  var requiredFields = _.reject(['username','country_id', 'email', 'password', 'address', 'mobile','confirm_password','latitude', 'longitude'], (o) => { return _.has(data, o)  })

  if (requiredFields == ''){
	var mobilenumber = /^[0-9]+$/;
	var mailId = data.email;
	var emailFormat = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
	if((data.username).length > 100){
		return res.send(setRes(resCode.BadRequest, false, 'Username must be less than 100 characters',null));
	}
	if (mailId.match(emailFormat) == null) {
		return res.send(setRes(resCode.BadRequest, false, 'Please enter valid email format.', null));
	}
	if ((data.mobile.length > 15) || (data.mobile.length < 7) || !(mobilenumber.test(data.mobile))) {
		return res.send(setRes(resCode.BadRequest, false, 'Please enter valid mobile number.', null));
	}

	  dbModel.findOne({
		  where: { email: data.email, is_deleted: false }
	  }).then(async emailValidation => {
		  if (emailValidation != null) {
			  return res.send(setRes(resCode.BadRequest, false, 'This email is already accociated with another account.', null));
		  } else {
			  dbModel.findOne({
				  where: { mobile: data.mobile,country_id:data.country_id, is_deleted: false }
			  }).then(async phoneValidation => {
				  if (phoneValidation != null) {
					return res.send(setRes(resCode.BadRequest, false, 'This mobile number is already accociated with another account.', null));
				  } else {
					  const token = jwt.sign({ user: data.email }, 'secret')
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
								  resetUrl: commonConfig.app_url + '/api/user/account-activation/' + token,
								  username: data.username
							  }


							  templates.render(path.join(__dirname, '../../', 'template', 'account-activation.html'), context, function (
								  err,
								  html,
								  text,
								  subject
							  ) {
								  //   return
								  transporter.sendMail(
									  {
										  from: 'b.a.s.e. <do-not-reply@mail.com>',
										  //   to: 'abc@yopmail.com',
										  to: data.email,
										  //   cc: ['test1@yopmail.com', 'test2@yopmail.com'],
										  subject: 'Welcome to b.a.s.e.! Activate our Account',
										  html: html
									  },
									  function (err, result) {
										  if (err) {
							  				res.send(setRes(resCode.BadRequest, false, 'Something went wrong.', null));
										  } else {
											  res.send(setRes(resCode.OK, true, `Email has been sent to ${(users.email).toLowerCase()}, with account activation instuction.. `, true));
										  }
									  }
								  )
							  })

							  res.send(setRes(resCode.OK, true, `Email has been sent to ${(users.email).toLowerCase()}, with account activation instuction.. `, null));
						  } else {
							  res.send(setRes(resCode.BadRequest, false, 'user registration fail', null));
						  }
					  })
						  .catch(err => {
							  res.send(setRes(resCode.BadRequest, false, "Fail to register user.", null))
						  });
				  }
			  })
		  }
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
    var countryModel = models.countries
    var templateModel = models.templates
    var categoryModel = models.business_categorys

    var requiredFields = _.reject(['email', 'password', 'role'], (o) => {
        return _.has(data, o)
    })

    if (requiredFields == '') {

        //user login
        if (data.role == 2) {

            userModel.findOne({
                where: {
                    email: data.email,
                    // is_active: 1,
                    is_deleted: false
                },
                include: [{
                    model: models.countries,
                    attributes: ['id', 'country_code', 'phone_code', 'currency', 'currency_symbol']
                }]
            }).then(function(user) {
                if (!user) {
                    res.send(setRes(resCode.ResourceNotFound, false, 'User not found.', null))
                } else {
                    if (user.is_active == false) {
                        res.send(setRes(resCode.Unauthorized, false, 'Your account has been deactivated. Please contact administrator.', null))
                    } else {
                        bcrypt.compare(data.password, user.password, async function(err, result) {
                            if (result == true) {

                                const token = jwt.sign({
                                    id: user.id,
                                    user: user.email,
                                    role_id: user.role_id
                                }, 'secret', {
                                    expiresIn: 480 * 480
                                })
                                delete user.dataValues.auth_token
                                user.dataValues.auth_token = token

                                userModel.update({
                                        auth_token: token,
                                        device_token: data.device_token,
                                    }, {
                                        where: {
                                            id: user.id
                                        }
                                    })
                                    .then(async function(newUser) {
                                        if (newUser) {
                                            if (user.profile_picture != null) {
                                                var profile_picture = await awsConfig.getSignUrl(user.profile_picture).then(function(res) {
                                                    user.profile_picture = res
                                                })
                                            } else {
                                                user.profile_picture = commonConfig.default_user_image;
                                            }
                                            res.send(setRes(resCode.OK, true, 'You are successfully logged in', user))
                                        } else {
                                            res.send(setRes(resCode.BadRequest, false, 'Token not updated', null))
                                        }
                                    })

                            } else {
                                res.send(setRes(resCode.BadRequest, false, "Invalid Email id or password", null))
                            }
                        });
                    }
                }
            });
        }
        //business login 
        else if (data.role == 3) {

            businessModel.findOne({
                where: {
                    email: data.email,
                    // is_active: true,
                    is_deleted: false
                },
                include: [{
                        model: categoryModel,
                    },
                    {
                        model: countryModel,
                        attributes: ['id', 'country_code', 'phone_code', 'currency', 'currency_symbol']
                    }
                ]
            }).then(function(business) {
                if (!business) {
                    res.send(setRes(resCode.ResourceNotFound, false, 'Business not found.', null))
                } else {
                    if (business.is_active == 0 || business.approve_by == null) {
                        res.send(setRes(resCode.Unauthorized, false, 'Your account has been deactivated. Please contact administrator.', null))
                    } else {
                        bcrypt.compare(data.password, business.password, async function(err, result) {
                            if (result == true) {

                                const token = jwt.sign({
                                    id: business.id,
                                    user: business.email,
                                    role_id: business.role_id
                                }, 'secret', {
                                    expiresIn: 480 * 480
                                })
                                delete business.dataValues.auth_token
                                business.dataValues.auth_token = token

                                businessModel.update({
                                        auth_token: token,
                                        // device_type: data.device_type,
                                        device_token: data.device_token,
                                        // device_id: data.device_id
                                    }, {
                                        where: {
                                            id: business.id
                                        }
                                    })
                                    .then(async function(newBusiness) {
                                        if (newBusiness) {
                                            if (business.profile_picture == null) {
                                                business.profile_picture = commonConfig.default_user_image;
                                            }
                                            //custome template url
                                            if (business.banner != null) {

                                                var banner = await awsConfig.getSignUrl(business.banner).then(function(res) {
                                                    business.banner = res
                                                })
                                            } else {
                                                business.banner = commonConfig.default_image;
                                            }
                                            if (business.profile_picture != null) {

                                                var profile_picture = await awsConfig.getSignUrl(business.profile_picture).then(function(res) {
                                                    business.profile_picture = res
                                                })
                                            } else {
                                                business.profile_picture = commonConfig.default_user_image;
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

                                            res.send(setRes(resCode.OK, true, 'You are successfully logged in', business))
                                        } else {
                                            res.send(setRes(resCode.InternalServer, false, 'Token not updated', null))
                                        }
                                    })

                            } else {
                                res.send(setRes(resCode.BadRequest, false, "Invalid Email id or password", null))
                            }
                        });
                    }
                }
            }).catch(error => {
                res.send(setRes(resCode.InternalServer, false, "Internal Server Error", null))
            });
        } else {
            res.send(setRes(resCode.BadRequest, false, 'Invalid role.', null))
        }

    } else {
        res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
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
			},
			include:[{
				model: models.countries,
				attributes: ['id', 'country_code', 'phone_code', 'currency', 'currency_symbol']
			}]
		}).then(async user => {
			if (user != null){
				if(user.profile_picture != null){

					var profile_picture = await awsConfig.getSignUrl(user.profile_picture).then(function(res){
						user.profile_picture = res;
					});
				}else{
					user.profile_picture = commonConfig.default_user_image;
				}
				user.dataValues.cashback_earned = 0;
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
	var data = req.body
	var validation = true;
	req.file ? data.profile_picture = `${req.file.key}` : ''
	var userModel = models.user
	const Op = models.Op;
	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o) })

	if (requiredFields == '') {
		var mobilenumber = /^[0-9]+$/;
		var mailId = data.email;
		var emailFormat = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
		if(!data?.username || (data?.username)?.length > 100){
			return res.send(setRes(resCode.BadRequest, false, 'Username must be less than 100 characters',null));
		}
		if (!mailId || mailId?.match(emailFormat) == null) {
			return res.send(setRes(resCode.BadRequest, false, 'Please enter valid email format.', null));
		}
		if (!data?.mobile || (data.mobile.length > 15) || (data.mobile.length < 7) || !(mobilenumber.test(data.mobile))) {
			return res.send(setRes(resCode.BadRequest, false, 'Please enter valid mobile number.', null));
		}

		userModel.findOne({
			where: {
				id: data.id,
				is_deleted: false,
				is_active: true
			}
		}).then(async user => {
			if (_.isEmpty(user)) {
				res.send(setRes(resCode.ResourceNotFound, false, "User not found.", null))
			} else {
				if(data.profile_picture != null){
					const params = { Bucket: awsConfig.Bucket, Key: user.profile_picture }; awsConfig.deleteImageAWS(params);
				}
				const emailData = await userModel.findOne({
					where: { is_deleted: false, email: { [Op.eq]: data.email }, id: { [Op.ne]: data.id } }
				});

				if (emailData != null) {
					validation = false;
					return res.send(setRes(resCode.BadRequest, false, 'This email is already associated with another account !', null))
				}

				const phoneData = await userModel.findOne({
					where: { is_deleted: false,country_id:data.country_id , mobile: { [Op.eq]: data.mobile }, id: { [Op.ne]: data.id } }
				});

				if (phoneData != null) {
					validation = false;
					return res.send(setRes(resCode.BadRequest, false, 'This mobile number is already associated with another account !', null))
				}
				if (validation) {
					if (data.email) {
						const token =  jwt.sign({id:user.id,user: data.email,role_id:user.role_id}, 'secret', {expiresIn: 480 * 480})
						data.auth_token = token;
					}

					

					userModel.update(data, {
						where: {
							id: data.id
						}
					}).then(async user => {
						if (user == 1) {
							userModel.findOne({
								where: {
									id: data.id,
									is_deleted: false,
									is_active: true
								},
								include:[
									{
										model: models.countries,
										attributes: ['id', 'country_code', 'phone_code', 'currency', 'currency_symbol']
									}
								]
							}).then(async userData => {
								if (data.profile_picture != null) {
									var updateData_image = await awsConfig.getSignUrl(data.profile_picture).then(function (res) {
										userData.profile_picture = res;
									})
								} else if (userData.profile_picture != null) {
									var old_image = await awsConfig.getSignUrl(userData.profile_picture).then(function (res) {
										userData.profile_picture = res;
									})
								}
								else {
									userData.profile_picture = commonConfig.default_user_image;
								}

								res.send(setRes(resCode.OK, true, "User Profile Updated Successfully.", userData))
							})

						}
						else {
							res.send(setRes(resCode.BadRequest, false, "Fail to Update User Profile.", null))
						}
					}).catch(error => {
						res.send(setRes(resCode.InternalServer, true, "Internal server error.", null))
					})
				}
			}

		})

	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
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
						if (data.new_password == data.confirm_password){
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
										res.send(setRes(resCode.BadRequest, false, "Fail to update password.",null))
									}
								})
							})
						}else{
							res.send(setRes(resCode.BadRequest, false, "New Password and confirem password not match.",null))
						}
						
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
		res.send(setRes(resCode.BadRequest, true, (requiredFields.toString() + ' are required')),null)
	}
}
exports.forgotPassword = async (req, res) => {
    var data = req.body
    var userModel = models.user
    var businessModel = models.business
    var emailOtpVerifieModel = models.email_otp_verifies
    var requiredFields = _.reject(['email', 'role'], (o) => {
        return _.has(data, o)
    })
    if (requiredFields == '') {
        if (data.role == 2) {
            await userModel.findOne({
                where: {
                    email: data.email,
                    role_id: data.role,
                    is_deleted: false
                }
            }).then(async user => {
                if (user != null) {
                    if (user.is_active == false) {
                        return res.send(setRes(resCode.Unauthorized, false, "Your account has been deactivated. Please contact administrator.", null))
                    } else {
                        const otp = Math.floor(Math.random() * 9000) + 1000;
                        var currentDate = new Date();
                        var futureDate = new Date(currentDate.getTime() + commonConfig.email_otp_expired);
                        var expire_at = moment.utc(futureDate).format('YYYY-MM-DD HH:mm:ss');
                        await emailOtpVerifieModel.create({
                            user_id: user.id,
                            email: data.email,
                            otp: otp,
                            role_id: data.role,
                            expire_at: expire_at
                        }).then(function(OtpData) {
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
                                    otp: otp,
                                    username: user.username,
                                    expire_at: expire_at
                                }
                                templates.render(path.join(__dirname, '../../', 'template', 'email-otp.html'), context, function(
                                    err,
                                    html,
                                    text,
                                    subject
                                ) {
                                    transporter.sendMail({
                                            from: 'b.a.s.e. <do-not-reply@mail.com>',
                                            to: data.email,
                                            subject: 'Email OTP Verification',
                                            html: html
                                        },
                                        function(err, result) {
                                            if (err) {
                                                return res.send(setRes(resCode.BadRequsest, false, 'Something went wrong.', null));
                                            } else {
                                                // return res.send(setRes(resCode.OK, true, `Email has been sent to ${users.email}, with account activation instuction.. `, null));
												data.otp = otp;
												data.otp_valid_till = moment.utc(commonConfig.email_otp_expired).format("mm:ss")
												data.expire_at = expire_at;
												if (data.otp_flag == 1) {
													// Resend otp sent successfully on your email
													return res.send(setRes(resCode.OK, true, 'Resend otp sent successfully on your email', data))
					
												} else {
													return res.send(setRes(resCode.OK, true, 'We have sent otp to your email address.', data))
					
												}
                                            }
                                        }
                                    )
                                })
                            }
                        }).catch(err => {
                            return res.send(setRes(resCode.InternalServer, false, "Internal server error.", null))
                        });
                    }

                } else {
                    res.send(setRes(resCode.ResourceNotFound, false, "User not found.", null))
                }
            })
        } else if (data.role == 3) {
            businessModel.findOne({
                where: {
                    email: data.email,
                    role_id: data.role,
                    is_deleted: false
                }
            }).then(user => {

                if (user != null) {
                    if (user.is_active == false) {
                        res.send(setRes(resCode.Unauthorized, false, "Your account has been deactivated. Please contact administrator.", null))
                    } else {
                        const otp = Math.floor(Math.random() * 9000) + 1000;

                        var currentDate = new Date();
                        var futureDate = new Date(currentDate.getTime() + commonConfig.email_otp_expired);
                        // var new_date = futureDate.toLocaleString('en-US', { timeZone: 'UTC' });
                        var expire_at = moment.utc(futureDate).format('YYYY-MM-DD HH:mm:ss');
                        emailOtpVerifieModel.create({
                            user_id: user.id,
                            email: data.email,
                            otp: otp,
                            role_id: data.role,
                            expire_at: expire_at
                        }).then(function(OtpData) {

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
                                    otp: otp,
                                    username: user.person_name,
                                    expire_at: expire_at,
                                    logo_image: `../../../public/logo.png`,
                                }
                                templates.render(path.join(__dirname, '../../', 'template', 'email-otp.html'), context, function(
                                    err,
                                    html,
                                    text,
                                    subject
                                ) {
                                    transporter.sendMail({
                                            from: 'b.a.s.e. <do-not-reply@mail.com>',
                                            to: data.email,
                                            subject: 'Email OTP Verification',
                                            html: html
                                        },
                                        function(err, result) {
                                            if (err) {} else {
                                                res.send(setRes(resCode.OK, true, `Email has been sent to ${users.email}, with account activation instuction.. `, null));
                                            }
                                        }
                                    )
                                })
                            }
                            data.otp = otp;
                            data.otp_valid_till = moment.utc(commonConfig.email_otp_expired).format("mm:ss")
                            data.expire_at = expire_at;
                            if (data.otp_flag == 1) {
                                // Resend otp sent successfully on your email
                                res.send(setRes(resCode.OK, true, 'Resend otp sent successfully on your email', data))

                            } else {
                                res.send(setRes(resCode.OK, true, 'We have sent otp to your email address.', data))

                            }

                        }).catch(err => {
                            res.send(setRes(resCode.InternalServer, false, "Internal server error.", null))
                        });
                    }



                } else {
                    res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
                }
            })
        } else {
            res.send(setRes(resCode.ResourceNotFound, false, "Role Not Found", null))
        }

    } else {
        res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
    }


}

exports.OtpVerify = async (req, res) => {

  var data = req.body
  var emailOtpVerifieModel = models.email_otp_verifies

  var requiredFields = _.reject(['role','otp'], (o) => { return _.has(data, o)  })

  if(requiredFields == ""){
	await emailOtpVerifieModel.findOne({where:{otp:data.otp,role_id:data.role}}).then(async (otpUser) => {
		if(otpUser != null){
			 var now_date_time = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
		   var expire_time = moment(otpUser.expire_at).format('YYYY-MM-DD HH:mm:ss');
		   if(now_date_time > expire_time){
			   // otpUser.destroy();
			   return res.send(setRes(resCode.BadRequest,false,"This otp is expired!",null));
		   }else{
				if(data.role == 2 || data.role == 3){
						var roleModel = (data.role == 2 && data.role != 3) ? models.user : models.business;
						var user = await roleModel.findOne({where: {email: otpUser.email, is_deleted: false}});
						if (user == null){
							if(data.role == 2 && data.role != 3){
								return res.send(setRes(resCode.ResourceNotFound, false, 'User not found.',null));
							}else{
								return res.send(setRes(resCode.ResourceNotFound, false, 'Business not found.',null));
							}
						}else{
							var response = await sendForgotPasswordMail(user)
							if (response != null && !_.isUndefined(response)){
								otpUser.destroy();
								return res.send(setRes(resCode.OK, true, 'An e-mail has been sent to given email address with further instructions.',null));
							}
							else{
								return res.send(setRes(resCode.InternalServer, false, "Mail can't sent.",null))
							}
						}
				}else{
					return res.send(setRes(resCode.BadRequest, false, 'Invalid role.',null))
				}
		   }
	   }else{ 
		return res.send(setRes(resCode.BadRequest,false,"Please enter valid OTP.",null))
	  }
   	});
  }else{
  	return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
  }
}

async function sendForgotPasswordMail(user){
	try{
		const token = await new Promise((resolve, reject) => {
			crypto.randomBytes(20, (err, buf) => {
			  if (err) {
				reject(err);
			  } else {
				resolve(buf.toString('hex'));
			  }
			});
		});

		const newUser = user.update({  
			reset_pass_token: token,
			reset_pass_expire: Date.now() + 3600000
		}, {
			where: { id: user.id }
		});

		if (newUser === 0) {
			throw new Error('Token not updated');
		}

		const transporter = nodemailer.createTransport({
			host: mailConfig.host,
			port: mailConfig.port,
			secure: mailConfig.secure,
			auth: mailConfig.auth,
			tls: mailConfig.tls
		});

		const templates = new EmailTemplates();
		const context = {
		  resetUrl: commonConfig.app_url + '/api/user/resetPassword/' + token,
		  username: user.username
		};

		const result = await new Promise((resolve, reject) => {
			templates.render(path.join(__dirname, '../../', 'template', 'forgot-password.html'), context, function (
				err,
				html,
				text,
				subject
			  ) {
				transporter.sendMail(
				  {
					from: 'b.a.s.e. <do-not-reply@mail.com>',
					  to : user.email,
					subject: 'Reset Password',
					html: html
				  },
				  function (err, result) {
					if (err) {
						reject(err);
					} else {
						resolve(result);
					}
				  }
				)
			  });
		})
		
		return result;
	}catch(error){
		// res.send(setRes(resCode.BadRequest, false, "Something went wrong.",null))
		return null;
	}
}

exports.GetResetPasswordForm = async (req, res) => {
	var token = req.params.token
	var userModel = models.user
	var businessModel = models.business
	var Op = models.Op

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
					res.sendFile(path.join(__dirname, '../../template', 'page-expire.html'))
				}
			})
		}
  }).catch((GetUserError) => {
	res.send(setRes(resCode.BadRequest, null, true, GetUserError.message))
  })
}

exports.UpdatePassword = function (req, res) {
  	var token = req.params.token
	var userModel = models.user
	var businessModel = models.business
	var Op = models.Op

  userModel.findOne({
	  where: {
		reset_pass_token: token, 
		reset_pass_expire: { [Op.gt]: Date.now() },
		is_deleted: 0 
	  }
  }).then(async user => {
		if (user != null){
			var password = await bcrypt.hash(req.body.new_password, 10)
			.then(hash => {
				return hash
			})
			
			await userModel.update({
				reset_pass_token: null,
				reset_pass_expire: null,
				password: password
			},{
				where: {
					id: user.id
				}
			}).then(async updateUser => {
				if (updateUser == 1){
					res.send(setRes(resCode.OK,true, "Password Updated Successfully.",user))
					res.sendFile(path.join(__dirname, '../../template', 'password-update.html'))
				}
				else{
					res.send(setRes(resCode.BadRequest, false, "Fail to Update Password.",null))		
				}
			}).catch(UpdateUserError => {
				res.send(setRes(resCode.BadRequest, false, UpdateUserError.message,null))			
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
						res.send(setRes(resCode.BadRequest, false, UpdateBusinessError.message,null))			
					})
				}
				else{
					res.send(setRes(resCode.BadRequest, false, "Fail to Update Password.",null))
				}
			}).catch(GetBusinessError => {
				res.send(setRes(resCode.BadRequest,false, GetBusinessError.message,true))			
			})
		}
  }).catch((GetUserError) => {
	res.send(setRes(resCode.BadRequest, false,"Internal server error." ,null))
  })
}

exports.SendFeedback = async (req, res) => {
	var data = req.body
	var feedbackModel = models.feedback
	var userModel = models.user
	var businessModel = models.business


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
				res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
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
				  transporter.sendMail(
					{
					  from: 'b.a.s.e. <do-not-reply@mail.com>',
					  to: 'base@yopmail.com',
					  subject: 'Feedback From Customer',
					  html: html
					},
					function (err, result) {
					  if (err) {
						callback(err)
					  } else {
						callback(result)
					  }
					}
				  )
				})
			  }
			],
			function (result) {
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

	var data = req.body;
	var businessModel = models.business
	var Op = models.Op;
	var businesscateogryModel = models.business_categorys
	var settingModel = models.settings

	var requiredFields = _.reject(['page', 'page_size'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}

		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)

		var condition = {
			include: [{
				model: businesscateogryModel,
				attributes: ['name'] 
			}, {
				model: settingModel,
			}],
			order: [
				['createdAt', 'DESC']
			],
			attributes: { exclude: ['is_deleted', 'is_enable','auth_token','device_type',
				'role_id','sections','template_id','color_code','approve_by',
				'booking_facility','abn_no','password','account_name','person_name',
				'reset_pass_token','reset_pass_expire','device_token','business_category','account_number',
				'latitude','longitude','email','device_id','phone'] }
		}

		if(data.category_id){
			condition.where = {...condition.where,...{category_id:data.category_id,is_deleted:false,is_active:true}}
		}else{
			condition.where = {...condition.where,...{is_deleted:false,is_active:true}}
		}
		if(data.search && data.search != null){
			condition.where = {...condition.where,...{[Op.or]: [{business_name: {[Op.like]: "%" + data.search + "%",}}],}}
		}

		if(data.page_size != 0 && !_.isEmpty(data.page_size)){
			condition.offset = skip,
			condition.limit = limit
		}

		var totalRecords = await businessModel.count(condition);
		
		await businessModel.findAll(condition).then(async businessData => {
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

					if (data.setting != null) {
						var date =  data.setting.setting_value
						var arr1 = date.split('_');
						var from = moment(arr1[0], "HH:mm").format("hh:mm A");
						var to = moment(arr1[1], "HH:mm").format("hh:mm A");
						data.dataValues.available = `${from} - ${to}`;
						delete data.dataValues.setting;
					} else {
						data.dataValues.available = "";
					}
				}
				const response = new pagination(businessData, totalRecords, parseInt(data.page), parseInt(data.page_size));
				res.send(setRes(resCode.OK,true,'Get Business successfully',(response.getPaginationInfo())))
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,'Business not found',null))
			}
		}).catch(error => {
			res.send(setRes(resCode.BadRequest,false,"Fail to get business",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.Logout = async (req, res) => {
	try{
		const data = req.body;
		var Op = models.Op
		var requiredFields = _.reject(['device_id', 'device_type'], (o) => { return _.has(data, o)  })

		if(requiredFields == ""){
			const authHeader = req.headers["authorization"];
			const TokenData =  jwt.verify(authHeader, 'secret', {expiresIn: 480 * 480})
			var roleId = TokenData.role_id

			const authModel = (roleId == 2 && roleId != 3) ? models.user : models.business;
			const user = await authModel.findOne({
				where:{id : TokenData.id, is_deleted:false,is_active:true}
			});
			if(user){
				const token =  jwt.sign({id:user.id,user: user.email,role_id:user.role_id}, 'secret', {expiresIn: 480 * 480})
				delete user.dataValues.auth_token
				user.dataValues.auth_token = token
				authModel.update(
					{auth_token: token,},
					{where: {id: user.id}
				}).then(async function (newUser) {
					if(newUser){
						const deviceModel = models.device_tokens;
						const condition = {};
						if(roleId == 2 && roleId != 3){
							condition.where = {user_id:user.id}
						}else{
							condition.where = {business_id:user.id}
						}
						if(data.device_type == 1 && data.device_type != 2){
							condition.where = {...condition.where,...{device_type:'ios'}}
						}else{
							condition.where = {...condition.where,...{device_type:'android'}}
						}
						condition.where = {...condition.where,...{device_id:data.device_id,status:1}}
						const loginUserDevices = await deviceModel.findOne(condition);
						if(loginUserDevices){
							await deviceModel.findOne(condition).then(async Data => {
								Data.destroy();
							});
							const deleteData = await loginUserDevices.update({
								status:9,
							});
							res.send(setRes(resCode.OK,true,'Logout successfully',null))
						}else{
							res.send(setRes(resCode.BadRequest, false, "Oops not you have not logged in this devices.",null))
						}
					}else{
						res.send(setRes(resCode.BadRequest, false, "Can't logged out.",null))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
			}
		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
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
		const userEventsModel = models.user_events;
		var businesscateogryModel = models.business_categorys
		const productCategoryModel = models.product_categorys;
		const productModel = models.products;
		const userModel = models.user;
		var businessArray = [];
		var eventArray = [];
		const promises = [];

		businessArray.push(
			businessModel.findAll({
				where: { is_deleted: false, is_active: true },
				attributes: ['id','banner','business_name','address','description'] 
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
				  },
			}, include:[
				{
					model:businessModel,
					attributes: ['id','business_name','category_id'],
					include:[
						{
							model:businesscateogryModel,
							attributes: ['id','name'],
						},
					]
				},
			], attributes: ['id','image','name','amount','cashback_percentage','expire_at'] },
			).then(async giftCardData => {
				if (giftCardData.length > 0){
					const dataArray = [];
					// Update Sign URL
					for(const data of giftCardData){
						if(data.image != null){
							var images = data.image
							const signurl = await awsConfig.getSignUrl(images.toString()).then(function(res){
								data.image = res;
							});
						} else {
							data.image = commonConfig.default_image;
						}

							// Gset businesss name
							if (data.business != null) {
								data.dataValues.business_name = data.business.business_name;
							} else {
								data.dataValues.business_name = "";
							}
							if(data.business.business_category != null){
								data.dataValues.category_name = data.business.business_category.name;
							} else {
								data.dataValues.category_name = "";
							}
							delete data.dataValues.business;
						let result = JSON.parse(JSON.stringify(data));
						result.type = "gift_cards";
						dataArray.push(result);
					}
					return dataArray;
				}
				return [];
			}),
			cashbackModel.findAll({
				where:{isDeleted:false,status:true,deleted_at: null,validity_for: { 
					[Op.gt]: currentDate
				},
			},
				include: [
					{
						model: productCategoryModel,
						attributes: ["id", "name"]
					}
				],
			attributes: ['id','title','cashback_value','product_category_id','product_id','description','validity_for']}).then(async CashbackData => {
				if (CashbackData.length > 0){
					const dataArray = [];
					for(const data of CashbackData){
					let result = 	JSON.parse(JSON.stringify(data));
					const products = await productModel.findAll({ where: { id: { [Op.in] : result.product_id?.split(',') || [] } } ,attributes: ["name"], raw: true});
					const product_name_arr = products?.map(val => val.name);
					const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
					result.product_name = product_name;
					result.product_category_name = result?.product_category?.name || '';
					delete result?.product_category;
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
				},
			},
			include: [
				{
					model: productCategoryModel,
					attributes: ["id", "name"]
				}
			],
			attributes: ['id','business_id', 'title', 'discount_type', 'discount_value', 'product_category_id', 'product_id', 'validity_for', 'status']}).then(async DiscountData => {
					if (DiscountData.length > 0){
						const dataArray = [];
						for(const data of DiscountData){
							let result = 	JSON.parse(JSON.stringify(data));
							const products = await productModel.findAll({ where: { id: { [Op.in] : result.product_id?.split(',') || [] } } ,attributes: ["name"], raw: true});
							const product_name_arr = products?.map(val => val.name);
							const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
							result.product_name = product_name;
							result.product_category_name = result?.product_category?.name || '';
							delete result?.product_category;
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
				},
			},include: [
				{
					model: productCategoryModel,
					attributes: ["id", "name"]
				}
			],attributes: ['id', 'business_id', 'title', 'coupon_code', 'coupon_type', 'product_category_id', 'product_id', 'value_type', 'coupon_value', 'validity_for', 'expire_at', 'description', 'status']}).then(async CouponeData => {
				if (CouponeData.length > 0){
					const dataArray = [];
					for(const data of CouponeData){
					let result = 	JSON.parse(JSON.stringify(data));
					const products = await productModel.findAll({ where: { id: { [Op.in] : result.product_id?.split(',') || [] } } ,attributes: ["name"], raw: true});
					const product_name_arr = products?.map(val => val.name);
					const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
					result.product_name = product_name;
					result.product_category_name = result?.product_category?.name || '';
					delete result?.product_category;
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
				},
			},include: [
				{
					model: productModel,
					attributes: ['id', 'name', 'category_id'],
					include: [
						{
							model: productCategoryModel,
							attributes: ['id', 'name'],
							as: 'product_categorys'
						}
					],
				}
			],attributes: ['id', 'business_id', 'loyalty_type', 'name', 'points_earned', 'product_id', 'amount', 'points_redeemed', 'validity', 'validity_period', 'status']}).then(async LoyaltyPointData => {
				if (LoyaltyPointData.length > 0){
					const dataArray = [];
					for(const data of LoyaltyPointData){
					let result = 	JSON.parse(JSON.stringify(data));
					result.product_name = result?.product?.name || '';
					result.product_category_name = result?.product?.product_categorys?.name || '';
					delete result?.product;
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

		const userDetails = await userModel.findOne({ where: { email: req.userEmail, is_deleted: false , is_active: true } });
		const userId = userDetails?.id || '';
		eventArray.push(
			combocalenderModel.findAll({
				where: { end_date: {
					[Op.gt]: currentDate
				  },
				},
				include: [{
					model: userEventsModel,
					where: {
						user_id: userId,
						is_deleted: false
					},
					required: false
				  },{
					model: businessModel,
					where: {
						is_active: true,
						is_deleted: false
					},
					required: true
				}],
				attributes: ['id','business_id','images','title','description','start_date','end_date','start_time','end_time', 'status']
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

						data.dataValues.is_user_join = false;
						if (data.user_events && data.user_events?.length > 0) {
							data.dataValues.is_user_join = true;
						}
						delete data.dataValues.user_events;
						delete data.dataValues.business;
						const eventStartDate = moment(`${data.start_date} ${data.start_time}`)
						const eventEndDate = moment(`${data.end_date} ${data.end_time}`)
						const isStartDatePastDate =moment(eventStartDate).isBefore(moment().format('YYYY-MM-DD HH:mm:ss'));
						const isEndDatePastDate = moment(eventEndDate).isBefore(moment().format('YYYY-MM-DD HH:mm:ss'));
						if (data.dataValues.status == 4) {
							data.dataValues.event_status = 'Cancelled';
						} else {
							if (isEndDatePastDate && isStartDatePastDate) {
								data.dataValues.event_status = 'Completed';
							}else if (isStartDatePastDate && isEndDatePastDate == false) {
								data.dataValues.event_status = 'Inprogress';
							} else {
								data.dataValues.event_status = 'Pending';
							}
						}
						delete data.dataValues.status
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
		resData.rewards_and_loyalty = result;
		resData.upcoming_events = eventDataArray;

		res.send(setRes(resCode.OK, true, "Get home page details successfully.",resData))
	} catch(error){
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
/**
 * User: Online Store Reward Older api
 */
exports.rewardsListOlder = async (req, res) => {
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
				return res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
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

/**
 * User: Online Store Reward Latest api
 */
exports.rewardsList =async(req,res) => {
	try{
		const data = req.body
		const giftCardModel = models.gift_cards
		const cashbackModel = models.cashbacks
		const discountModel = models.discounts
		const couponeModel = models.coupones
		const Op = models.Op
		const currentDate = (moment().format('YYYY-MM-DD'))
		const requiredFields = _.reject(['page','business_id'], (o) => { return _.has(data, o)  })
		
		if(requiredFields == ""){
			if(!data?.page || +(data.page) <= 0) {
				return res.send(setRes(resCode.BadRequest, null, false, "invalid page number, should start with 1"))
			}
			var typeArr = ['gift_cards','cashbacks','discounts','coupones'];
			let request_type = data?.type?.includes(',') && data?.type?.split(',').length > 0 ? data?.type?.split(',') : (data?.type && data?.type?.trim() !== '' ? [data?.type] : typeArr );
			request_type = request_type.filter( tp => tp && tp.trim() !== '');
			const requestTypeNotExists = request_type.filter( tp => !typeArr.includes(tp) && tp !== '' );
			if(request_type && requestTypeNotExists.length !== 0){
				return res.send(setRes(resCode.BadRequest, null, false, "Please select valid type."))
			}
			// if((request_type) && !(typeArr.includes(request_type))){
			// 	return res.send(setRes(resCode.BadRequest, null, false, "Please select valid type."))
			// }

			// Total limit for all records
			const limit = 15;
			const perTableLimit = Math.ceil(limit / (request_type.length || 4)) ;
			const lastTableLimit = (request_type.length % 2) != 0 ?  perTableLimit : perTableLimit - 1;
			const giftCardLoyaltyCondition =  data.search ? {
				[Op.or]: [
					{
						name: {
							[Op.like]: "%" + data.search + "%",
						}
					}
				]
			} : {}

			const cashBackDiscountCouponCondition = data.search ? {
				[Op.or]: [
					{
						title: {
							[Op.like]: "%" + data.search + "%",
						}
					}
				],
			} : {};
			const bussinessIdCond = data.business_id ? {
				business_id: data.business_id
			} : {};

			let giftCardsRecords, cashbackRecords,discountRecords,couponeRecords;
			let remainingGiftcardRecordLimit = 0, remainingCashbackRecordLimit = 0,remainingDiscountRecordLimit=0,remainingCouponRecordLimit=0;
			/**
			 * Fetch Gift cards and calculate and forward to next module not fetched record limit 
			 */
			if (request_type.includes('gift_cards')) {
				giftCardsRecords = await giftCardModel.findAndCountAll({
					offset: perTableLimit * (data.page - 1),
					limit: perTableLimit,
					where:{
						isDeleted: false,
						status: true,
						expire_at: { 
							[Op.gt]: currentDate
						},
						...bussinessIdCond,
						...giftCardLoyaltyCondition					
					},
					attributes: {
						include: [[models.sequelize.literal("'gift_cards'"),"type"]]
					}
				});
				
				const fetchedGiftCardsCount = giftCardsRecords?.rows?.length || 0 ;
				remainingGiftcardRecordLimit = perTableLimit - fetchedGiftCardsCount > 0 ? perTableLimit - fetchedGiftCardsCount : 0 ;
			}
			

			/**
			 * Fetch Cashback records and calculate and forward to next module not fetched record limit 
			 */
			if (request_type.includes('cashbacks')) {
				cashbackRecords = await cashbackModel.findAndCountAll({
					offset: perTableLimit * (data.page - 1),
					limit: perTableLimit + remainingGiftcardRecordLimit,
					where: {
						isDeleted: false,
						status: true,
						validity_for: { 
							[Op.gt]: currentDate
						},
						...bussinessIdCond,
						...cashBackDiscountCouponCondition
					},
					attributes: {
						include: [[models.sequelize.literal("'cashbacks'"),"type"]]
					}
				});
	
				const fetchedCashbackCount = cashbackRecords?.rows?.length || 0 ;
				remainingCashbackRecordLimit = (perTableLimit + remainingGiftcardRecordLimit) - fetchedCashbackCount > 0 ? (perTableLimit + remainingGiftcardRecordLimit) - fetchedCashbackCount : 0 ;
			}
			// -----------------------------------------------------------------------------

			/**
			 * Fetch discount records and calculate and forward to next module not fetched record limit 
			 */
			if (request_type.includes('discounts')) {
				discountRecords = await discountModel.findAndCountAll({
					offset: perTableLimit * (data.page - 1),
					limit: perTableLimit + remainingCashbackRecordLimit,
					where:{
						isDeleted:false,
						status:true,
						validity_for: { 
							[Op.gt]: currentDate
						},
						...bussinessIdCond,
						...cashBackDiscountCouponCondition
					},
					attributes: {
						include: [[models.sequelize.literal("'discounts'"),"type"]]
					}
				});
				
				const fetchedDiscountCount = discountRecords?.rows?.length || 0 ;
				remainingDiscountRecordLimit = (perTableLimit + remainingCashbackRecordLimit) - fetchedDiscountCount > 0 ? (perTableLimit + remainingCashbackRecordLimit) - fetchedDiscountCount : 0 ;
			}
			// -----------------------------------------------------------------------------

			/**
			 *  Fetch coupon records and calculate and forward to next module not fetched record limit 
			 */
			if (request_type.includes('coupones')) {
				couponeRecords = await couponeModel.findAndCountAll({
					offset: lastTableLimit * (data.page - 1),
					limit: lastTableLimit + remainingDiscountRecordLimit,
					where:{
						isDeleted:false,
						status:true,
						expire_at: { 
							[Op.gt]: currentDate
						},
						...bussinessIdCond,
						...cashBackDiscountCouponCondition
					},
					attributes: {
						include: [[models.sequelize.literal("'coupones'"),"type"]]
					}
				});
				
				const fetchedCouponCount = couponeRecords?.rows?.length || 0 ;
				remainingCouponRecordLimit = (perTableLimit + remainingDiscountRecordLimit) - fetchedCouponCount > 0 ? (perTableLimit + remainingDiscountRecordLimit) - fetchedCouponCount : 0 ;
			}
			// -----------------------------------------------------------------------------			


			const fetchedGiftCardsRecords = giftCardsRecords?.rows || [];
			const totalGiftCardRecords = giftCardsRecords?.count || 0;

			const fetchedCashbackRecords = cashbackRecords?.rows || [];
			const totalCashbackRecords = cashbackRecords?.count || 0;

			const fetchedDiscountRecords = discountRecords?.rows || [];
			const totalDiscountRecords = discountRecords?.count || 0;
			
			const fetchedCouponRecords = couponeRecords?.rows || [];
			const totalCouponRecords = couponeRecords?.count || 0;


			const total_records = totalGiftCardRecords + totalCashbackRecords + totalDiscountRecords + totalCouponRecords;
			const totalPages = Math.ceil(total_records / limit);
			const currentPage = +(data.page)
			const per_page = limit;
			const lastPage = totalPages;
			const previousPage = currentPage - 1 <= 0 ? null : (currentPage - 1);
			const nextPage = currentPage + 1 > lastPage ?  null : (currentPage + 1);

			const arrays = [fetchedGiftCardsRecords, fetchedCashbackRecords, fetchedDiscountRecords, fetchedCouponRecords];

			// const [giftcardRewards,cashbackData,discountData,couponeData,loyaltyPointData] = await Promise.all(promises);

			// const arrays = [giftcardRewards, cashbackData,discountData,couponeData,loyaltyPointData];

			const mergedArray = mergeRandomArrayObjects(arrays);
			// let result =  mergedArray.slice(skip, skip+limit);
			const result = mergedArray;
			// if(!(_.isEmpty(request_type))){
			// 	result = _.filter(result, {type: request_type})
			// }
			let resData = {};
			resData.data = result;

			resData.total_records = total_records;
			resData.totalPages = totalPages;
			resData.currentPage = currentPage;
			resData.per_page = per_page;
			resData.nextPage = nextPage;
			resData.previousPage = previousPage;
			resData.lastPage = lastPage;

			res.send(setRes(resCode.OK, true, "Get rewards list successfully",resData))
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
			return res.send(setRes(resCode.BadRequest, false, "Please select valid type.",null))
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
				res.send(setRes(resCode.BadRequest, false, "Please select valid type.",null))
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
		  offset:skip,
		  limit:limit,
          where: {
            isDeleted: false,
            status: true,
            business_id: data.business_id,
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
			const loyaltyRecordCounts = await loyaltyPointModel.findAndCountAll({where: {
				isDeleted: false,
				status: true,
				business_id: data.business_id,
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
			  ]
			})
			const totalRecords = loyaltyRecordCounts?.count;
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
			const response = new pagination(loyaltyData, totalRecords, parseInt(data.page), parseInt(data.page_size));
            res.send(
              setRes(
                resCode.OK,
                true,
                "Get loyalty list successfully",
                (response.getPaginationInfo())
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
  await businessModel
    .findOne({
      where: { id: data.business_id, is_active: true, is_deleted: false },
	  attributes: ['id', 'business_name','description'], 
	  include: [
		{
			model: businessCategory,
			attributes: ['id','name'],
		},
		{
			model: settingModel,
			attributes:['id','setting_value']
		},
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

			//  Opening Time
			if (bio.setting != null) {
				var date =  bio.setting.setting_value
				var arr1 = date.split('_');
				var from = moment(arr1[0], "HH:mm").format("hh:mm A");
				var to = moment(arr1[1], "HH:mm").format("hh:mm A");
				bio.dataValues.available = `${from} - ${to}`;
			} else {
				bio.dataValues.available = null;
			}

			const TAndC = await cmsModels.findOne({where:{business_id:data.business_id,is_deleted:false,is_enable:true,page_key:'terms_of_service'}});

			// Terms And Conditions GET
			if (TAndC != null && !_.isEmpty(TAndC)) {
				bio.dataValues.terms_and_condition = TAndC.page_value;
			} else {
				bio.dataValues.terms_and_condition = null;
			}
			delete bio.dataValues.setting;
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

// Business event list
exports.businessEventList = async (req, res) => {
	try {
		var data = req.body;
		var combocalenderModel = models.combo_calendar;
		const businesModel = models.business
		var currentDate = moment().format("YYYY-MM-DD");
		var Op = models.Op;
		var requiredFields = _.reject(["page", "page_size"], (o) => {
			return _.has(data, o);
		});
		if (requiredFields == "") {
			if (data.page < 0 || data.page == 0) {
				return res.send(
					setRes(
						resCode.BadRequest,
						false,
						"invalid page number, should start with 1",
						null,
					)
				);
			}

			let skip = data.page_size * (data.page - 1);
			let limit = parseInt(data.page_size);
			var condition = {
				include: [
					{
						model: businesModel,
						where: {
							is_active: true,
							is_deleted: false
						},
						required: true
					}
				]
			}
			condition.where = {is_deleted: false,end_date: {
				[Op.gt]: currentDate
			},}
			if(data.search){
				condition.where = {...condition.where,...{[Op.or]: [{title: {[Op.like]: "%" + data.search + "%",}}]}}
			}
			if(data.business_id){
				condition.where = {...condition.where,...{business_id:data.business_id}}
			}
			if(data.page_size != 0 && !_.isEmpty(data.page_size)){
				condition.offset = skip,
				condition.limit = limit
			}
			combocalenderModel.findAll(condition).then(async event => {
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
						delete data.dataValues.business;
					}
					const recordCount = await combocalenderModel.findAndCountAll(condition);
					const totalRecords = recordCount?.count;
					const response = new pagination(event, parseInt(totalRecords), parseInt(data.page), parseInt(data.page_size));
					res.send(
						setRes(
						  resCode.OK,
						  true,
						  "Business Event List successfully",
						  (response.getPaginationInfo())
						)
					  );
			})
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
		res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null));
	}
}

// Register user in event
exports.eventUserRegister = async (req, res) => {
	try {
		var data = req.body
		var businessModel = models.business
		var comboModel = models.combo_calendar
		var userModel = models.user
		var eventUserModel = models.user_events
		const Op = models.Op;
		var validation = true;
		var currentDate = (moment().format('YYYY-MM-DD'))
		var requiredFields = _.reject(["business_id","event_id", "user_id"], (o) => {
			return _.has(data, o);
		});
		if (requiredFields == "") { 
			if(data.business_id){
				await businessModel.findOne({
					where: {id: data.business_id,is_deleted: false,is_active:true}
				}).then(async business => {
					if(_.isEmpty(business)){
						validation = false;
						return res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
					}
				})
			}

			if(data.event_id){
				var condition = {}		
				if(!_.isEmpty(data.business_id)){
					condition.where = {business_id:data.business_id}
				}
				condition.where = {...condition.where,...{id: data.event_id,is_deleted: false,end_date: {
					[Op.gt]: currentDate
				},}}
				await comboModel.findOne(condition).then(async event => {
					if(_.isEmpty(event)){
						validation = false;
						return res.send(setRes(resCode.ResourceNotFound, false, "Event not found.", null))
					}
				})
			}

			if(data.user_id){
				await userModel.findOne({
					where: {id:data.user_id,is_deleted: false,is_active:true}
				}).then(async user => {
					if(_.isEmpty(user)){
						validation = false;
						return res.send(setRes(resCode.ResourceNotFound, false, "User not found.", null))
					}
				})
			}

			const isUserExist = await eventUserModel.findOne({
				where:{user_id:data.user_id,event_id:data.event_id, business_id:data.business_id,is_deleted:false,is_available:true}
			})

			if(isUserExist){
				validation = false;
				return res.send(setRes(resCode.BadRequest, false, "User already registred in this business event.", null))
			}
			if(validation){
				await eventUserModel.create(data).then(event_user => {
					if(event_user){
						res.send(setRes(resCode.OK,true,"You are successfully register in this event.",event_user))
					}
				}).catch(error => {
					res.send(setRes(resCode.BadRequest, false, "Fail to register in this event!", null))
				})
			}
		} else {
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
		}
	} catch (error) {
		res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null))
	}
} 

// User Event Listing API
exports.userEventList = async (req, res) => {
	var data = req.body;
	var combocalenderModel = models.combo_calendar;
	const businesModel = models.business;
	var userEventModel = models.user_events
	var currentDate = moment().format("YYYY-MM-DD");
	var Op = models.Op;
	var requiredFields = _.reject(["page", "page_size","user_id"], (o) => {
		return _.has(data, o);
	});
	if (requiredFields == "") {
		if (data.page < 0 || data.page == 0) {
			return res.send(setRes(resCode.BadRequest,false,"invalid page number, should start with 1",null));
		}
		let skip = data.page_size * (data.page - 1);
		let limit = parseInt(data.page_size);

		var condition = {
			attributes: ['id','business_id','images','title','description','start_date','end_date','start_time','end_time','status'],
			include: [
				{
				  model: userEventModel,
				  attributes: ["id","user_id"],
				  where:{user_id:data.user_id,is_deleted:false},
				  include: [
					{
						model: models.user,
						attributes:['id','username','email','mobile','profile_picture']
					}
				  ]
				},
				{
					model: businesModel,
					where: {
						is_active: true,
						is_deleted: false
					},
					required: true
				}
			],
		}	
		condition.where = {
			is_deleted: false,
			end_date: {
				[Op.gt]: currentDate
			},
		}
		if(!_.isEmpty(data.search)){
			condition.where = {...condition.where,
				...{[Op.or]: [{
					title: {
						[Op.like]: "%" + data.search + "%",
					}
				}]}
			}
		}

		if(!_.isEmpty(data.from_date) && !_.isEmpty(data.to_date)){
			var startDate = moment(data.from_date).format('YYYY-MM-DD')
			var endDate = moment(data.to_date).format('YYYY-MM-DD')
			condition.where = {...condition.where, ...{
					start_date: {
						[Op.between]: [startDate,endDate]
					}
				}
			}
		}

		if(data.page_size != 0 && !_.isEmpty(data.page_size)){
			condition.offset = skip,
			condition.limit = limit
		}

		combocalenderModel.findAll(condition).then(async event => {
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
					delete data.dataValues.business;
				}
				const recordCount = await combocalenderModel.findAndCountAll(condition);
				const totalRecords = recordCount?.count;
				const response = new pagination(event, parseInt(totalRecords), parseInt(data.page), parseInt(data.page_size));
				res.send(
					setRes(
					  resCode.OK,
					  true,
					  "User business event list successfully",
					  (response.getPaginationInfo())
					)
				  );
			}else {
				res.send(
				  setRes(resCode.ResourceNotFound, false, "Event not found", [])
				);
			  }
		})
	}else {
		res.send(setRes(resCode.BadRequest,false,requiredFields.toString() + " are required",null));
	}
}

// User Leave API
exports.eventUserLeave = async (req, res) => {
	try {
		var data = req.body
		var businessModel = models.business
		var comboModel = models.combo_calendar
		var userModel = models.user
		var eventUserModel = models.user_events
		var validation = true;
		const Op = models.Op;
		var currentDate = (moment().format('YYYY-MM-DD'))
		var requiredFields = _.reject(["id","business_id", "event_id", "user_id"], (o) => {
			return _.has(data, o);
		});
		if(data){
			if (requiredFields == "") {
				await eventUserModel.findOne({
					where: {id: data.id,is_deleted: false,is_available:true}
				}).then(async event_user => {
					if(_.isEmpty(event_user)){
						validation = false
						return res.send(setRes(resCode.ResourceNotFound, false, "User Event not found.", null))
					}
				})

				if(data.business_id && validation == true){
					await businessModel.findOne({
						where: {id: data.business_id,is_deleted: false,is_active:true}
					}).then(async business => {
						if(_.isEmpty(business)){
							validation = false
							return res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
						}
					})
				}
				
				if(data.event_id && validation == true){
					var condition = {}		
					if(!_.isEmpty(data.business_id)){
						condition.where = {business_id:data.business_id}
					}
					condition.where = {...condition.where,...{id: data.event_id,is_deleted: false,end_date: {
						[Op.gt]: currentDate
					},}}
					await comboModel.findOne(condition).then(async event => {
						if(_.isEmpty(event)){
							validation = false
							return res.send(setRes(resCode.ResourceNotFound, false, "Event not found.", null))
						}
					})
				}
			
	
				if(data.user_id && validation == true){
					await userModel.findOne({
						where: {id:data.user_id,is_deleted: false,is_active:true}
					}).then(async user => {
						if(_.isEmpty(user)){
							validation = false
							return res.send(setRes(resCode.ResourceNotFound, false, "User not found.", null))
						}
					})
				}
				
				const eventUserData = await eventUserModel.findOne({
					where: {id: data.id,business_id:data.business_id,event_id:data.event_id,user_id:data.user_id,is_deleted: false,is_available:true},
				});
				if(_.isEmpty(eventUserData) && validation == true){
					validation = false;
					return res.send(setRes(resCode.ResourceNotFound, false, "User not found in any event.", null))
				}
				
				if(validation){
					await eventUserModel.update(
						{is_deleted:true,
						is_available:false}
						,{
						where: {id: data.id,business_id:data.business_id,event_id:data.event_id,user_id:data.user_id,is_deleted: false,is_available:true}
					}).then(async dataVal =>{
						if(dataVal){
							await eventUserModel.findOne({
								where: {id: data.id},
							}).then(async user_data => {
								return res.send(setRes(resCode.OK, false, 'Leave successfully from event', user_data))
							})
						}
					}).catch(error => {
						return res.send(setRes(resCode.BadRequest, false, 'Fail to leave from event.', null))
					})
				}
				
			} else {
				return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
			}
		}else{
			return res.send(setRes(resCode.BadRequest, false, ('Id are required'), null))
		}
	} catch (error) {
		return res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null))
	}
}

