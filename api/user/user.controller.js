var async = require("async");
var crypto = require("crypto");
var EmailTemplates = require("swig-email-templates");
var nodemailer = require("nodemailer");
var path = require("path");
var resCode = require("../../config/res_code_config");
var commonConfig = require("../../config/common_config");
var setRes = require("../../response");
var jwt = require("jsonwebtoken");
var models = require("../../models");
var bcrypt = require("bcrypt");
var _ = require("underscore");
var mailConfig = require("../../config/mail_config");
var util = require("util");
var notification = require("../../push_notification");
var awsConfig = require("../../config/aws_S3_config");
var moment = require("moment");
const {verifyToken} = require("../../config/token");
const Sequelize = require("sequelize");
const {model} = require("mongoose");
const {error} = require("console");
const pagination = require("../../helpers/pagination");
const {
  NOTIFICATION_TITLES,
  NOTIFICATION_TYPES,
  NOTIFICATION_MESSAGE,
} = require("../../config/notificationTypes");
const fcmNotification = require("../../push_notification");

exports.Register = async (req,res) => {
  var data = req.body;
  req.file ? (data.profile_picture = `${req.file.key}`) : "";
  var dbModel = models.user;
  var Op = models.Op;

  var requiredFields = _.reject(
    [
      "username",
      "country_id",
      "email",
      "password",
      "address",
      "mobile",
      "confirm_password",
      "latitude",
      "longitude",
    ],
    (o) => {
      return _.has(data,o);
    }
  );

  if(requiredFields == "") {
    var mobilenumber = /^[0-9]+$/;
    var mailId = data.email;
    var emailFormat = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if(data.username.length > 100) {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          "Username must be less than 100 characters",
          null
        )
      );
    }
    if(mailId.match(emailFormat) == null) {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          "Please enter valid email format.",
          null
        )
      );
    }
    if(
      data.mobile.length > 15 ||
      data.mobile.length < 7 ||
      !mobilenumber.test(data.mobile)
    ) {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          "Please enter valid mobile number.",
          null
        )
      );
    }

    dbModel
      .findOne({
        where: {email: data.email,is_deleted: false},
      })
      .then(async (emailValidation) => {
        if(emailValidation != null) {
          return res.send(
            setRes(
              resCode.BadRequest,
              false,
              "This email is already accociated with another account.",
              null
            )
          );
        } else {
          dbModel
            .findOne({
              where: {
                mobile: data.mobile,
                country_id: data.country_id,
                is_deleted: false,
              },
            })
            .then(async (phoneValidation) => {
              if(phoneValidation != null) {
                return res.send(
                  setRes(
                    resCode.BadRequest,
                    false,
                    "This mobile number is already accociated with another account.",
                    null
                  )
                );
              } else {
                const token = jwt.sign({user: data.email},"secret");
                data.auth_token = token;
                data.email = data.email.toLowerCase();
                // data.device_type = data.device_type.toLowerCase();

                dbModel
                  .create(data)
                  .then(function(users) {
                    if(users) {
                      var transporter = nodemailer.createTransport({
                        host: mailConfig.host,
                        port: mailConfig.port,
                        secure: mailConfig.secure,
                        auth: mailConfig.auth,
                        tls: mailConfig.tls,
                      });

                      var templates = new EmailTemplates();
                      var context = {
                        resetUrl:
                          commonConfig.app_url +
                          "/api/user/account-activation/" +
                          token,
                        username: data.username,
                      };

                      templates.render(
                        path.join(
                          __dirname,
                          "../../",
                          "template",
                          "account-activation.html"
                        ),
                        context,
                        function(err,html,text,subject) {
                          //   return
                          transporter.sendMail(
                            {
                              from: "b.a.s.e. <do-not-reply@mail.com>",
                              //   to: 'abc@yopmail.com',
                              to: data.email,
                              //   cc: ['test1@yopmail.com', 'test2@yopmail.com'],
                              subject:
                                "Welcome to b.a.s.e.! Activate our Account",
                              html: html,
                            },
                            function(err,result) {
                              if(err) {
                                res.send(
                                  setRes(
                                    resCode.BadRequest,
                                    false,
                                    "Something went wrong.",
                                    null
                                  )
                                );
                              } else {
                                res.send(
                                  setRes(
                                    resCode.OK,
                                    true,
                                    `Email has been sent to ${users.email.toLowerCase()}, with account activation instuction.. `,
                                    true
                                  )
                                );
                              }
                            }
                          );
                        }
                      );

                      res.send(
                        setRes(
                          resCode.OK,
                          true,
                          `Email has been sent to ${users.email.toLowerCase()}, with account activation instuction.. `,
                          null
                        )
                      );
                    } else {
                      res.send(
                        setRes(
                          resCode.BadRequest,
                          false,
                          "user registration fail",
                          null
                        )
                      );
                    }
                  })
                  .catch((err) => {
                    res.send(
                      setRes(
                        resCode.BadRequest,
                        false,
                        "Fail to register user.",
                        null
                      )
                    );
                  });
              }
            });
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
};

exports.AccountActivationByToken = async (req,res) => {
  var data = req.params;
  var dbModel = models.user;

  dbModel
    .findOne({
      where: {
        auth_token: data.token,
      },
    })
    .then(function(user) {
      if(user != "") {
        dbModel
          .update({is_active: 1},{where: {id: user.id}})
          .then(function(userUpdated) {
            if(userUpdated) {
              res.sendFile(
                path.join(__dirname,"../../template","thank_you.html")
              );
            } else {
              res.sendFile(path.join(__dirname,"../../template","404.html"));
            }
          });
      } else {
        res.sendFile(path.join(__dirname,"../../template","404.html"));
      }
    })
    .catch((err) => {
      res.sendFile(path.join(__dirname,"../../template","404.html"));
    });
};

exports.Login = async (req,res) => {
  var data = req.body;
  var userModel = models.user;
  var businessModel = models.business;
  var countryModel = models.countries;
  var templateModel = models.templates;
  var categoryModel = models.business_categorys;
  var deviceModel = models.device_tokens;

  var requiredFields = _.reject(["email","password","role"],(o) => {
    return _.has(data,o);
  });

  if(requiredFields == "") {
    //user login
    if(data.role == 2) {
      await userModel
        .findOne({
          where: {
            email: data.email,
            // is_active: 1,
            is_deleted: false,
          },
          include: [
            {
              model: models.countries,
              attributes: [
                "id",
                "country_code",
                "phone_code",
                "currency",
                "currency_symbol",
              ],
            },
          ],
        })
        .then(async function(user) {
          if(!user) {
            res.send(
              setRes(resCode.ResourceNotFound,false,"User not found.",null)
            );
          } else {
            if(user.is_active == false) {
              res.send(
                setRes(
                  resCode.Unauthorized,
                  false,
                  "Your account has been deactivated. Please contact administrator.",
                  null
                )
              );
            } else {
              bcrypt.compare(
                data.password,
                user.password,
                async function(err,result) {
                  if(result == true) {
                    const token = jwt.sign(
                      {
                        id: user.id,
                        user: user.email,
                        role_id: user.role_id,
                      },
                      "secret",
                      {
                        expiresIn: 480 * 480,
                      }
                    );
                    delete user.dataValues.auth_token;
                    user.dataValues.auth_token = token;
                    //await deviceModel.update({
                    //	device_token:device_token
                    //}, {
                    //	where: {
                    //		id: user.id
                    //	}
                    //});
                    await userModel
                      .update(
                        {
                          auth_token: token,
                        },
                        {
                          where: {
                            id: user.id,
                          },
                        }
                      )
                      .then(async function(newUser) {
                        if(newUser) {
                          if(user.profile_picture != null) {
                            var profile_picture = await awsConfig
                              .getSignUrl(user.profile_picture)
                              .then(function(res) {
                                user.profile_picture = res;
                              });
                          } else {
                            user.profile_picture =
                              commonConfig.default_user_image;
                          }
                          res.send(
                            setRes(
                              resCode.OK,
                              true,
                              "You are successfully logged in",
                              user
                            )
                          );
                        } else {
                          res.send(
                            setRes(
                              resCode.BadRequest,
                              false,
                              "Token not updated",
                              null
                            )
                          );
                        }
                      });
                  } else {
                    res.send(
                      setRes(
                        resCode.BadRequest,
                        false,
                        "Invalid Email id or password",
                        null
                      )
                    );
                  }
                }
              );
            }
          }
        });
    }
    //business login
    else if(data.role == 3) {
      await businessModel
        .findOne({
          where: {
            email: data.email,
            // is_active: true,
            is_deleted: false,
          },
          include: [
            {
              model: categoryModel,
            },
            {
              model: countryModel,
              attributes: [
                "id",
                "country_code",
                "phone_code",
                "currency",
                "currency_symbol",
              ],
            },
          ],
        })
        .then(function(business) {
          if(!business) {
            res.send(
              setRes(
                resCode.ResourceNotFound,
                false,
                "Business not found.",
                null
              )
            );
          } else {
            if(business.is_active == 0 || business.approve_by == null) {
              res.send(
                setRes(
                  resCode.Unauthorized,
                  false,
                  "Your account has been deactivated. Please contact administrator.",
                  null
                )
              );
            } else {
              bcrypt.compare(
                data.password,
                business.password,
                async function(err,result) {
                  if(result == true) {
                    const token = jwt.sign(
                      {
                        id: business.id,
                        user: business.email,
                        role_id: business.role_id,
                      },
                      "secret",
                      {
                        expiresIn: 480 * 480,
                      }
                    );
                    delete business.dataValues.auth_token;
                    business.dataValues.auth_token = token;

                    //await deviceModel.update({
                    //	device_token:device_token
                    //}, {
                    //	where: {
                    //		business_id: business.id
                    //	}
                    //});
                    await businessModel
                      .update(
                        {
                          auth_token: token,
                          // device_type: data.device_type,
                          //device_token: data.device_token,
                          // device_id: data.device_id
                        },
                        {
                          where: {
                            id: business.id,
                          },
                        }
                      )
                      .then(async function(newBusiness) {
                        if(newBusiness) {
                          if(business.profile_picture == null) {
                            business.profile_picture =
                              commonConfig.default_user_image;
                          }
                          //custome template url
                          if(business.banner != null) {
                            var banner = await awsConfig
                              .getSignUrl(business.banner)
                              .then(function(res) {
                                business.banner = res;
                              });
                          } else {
                            business.banner = commonConfig.default_image;
                          }
                          if(business.profile_picture != null) {
                            var profile_picture = await awsConfig
                              .getSignUrl(business.profile_picture)
                              .then(function(res) {
                                business.profile_picture = res;
                              });
                          } else {
                            business.profile_picture =
                              commonConfig.default_user_image;
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

                          res.send(
                            setRes(
                              resCode.OK,
                              true,
                              "You are successfully logged in",
                              business
                            )
                          );
                        } else {
                          res.send(
                            setRes(
                              resCode.InternalServer,
                              false,
                              "Token not updated",
                              null
                            )
                          );
                        }
                      });
                  } else {
                    res.send(
                      setRes(
                        resCode.BadRequest,
                        false,
                        "Invalid Email id or password",
                        null
                      )
                    );
                  }
                }
              );
            }
          }
        })
        .catch((error) => {
          res.send(
            setRes(resCode.InternalServer,false,"Internal Server Error",null)
          );
        });
    } else {
      res.send(setRes(resCode.BadRequest,false,"Invalid role.",null));
    }
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
};

exports.GetProfileDetail = async (req,res) => {
  var data = req.body;
  var userModel = models.user;
  var requiredFields = _.reject(["id"],(o) => {
    return _.has(data,o);
  });

  if(requiredFields == "") {
    userModel
      .findOne({
        where: {
          id: data.id,
          is_deleted: false,
        },
        include: [
          {
            model: models.countries,
            attributes: [
              "id",
              "country_code",
              "phone_code",
              "currency",
              "currency_symbol",
            ],
          },
        ],
      })
      .then(async (user) => {
        if(user != null) {
          if(user.profile_picture != null) {
            var profile_picture = await awsConfig
              .getSignUrl(user.profile_picture)
              .then(function(res) {
                user.profile_picture = res;
              });
          } else {
            user.profile_picture = commonConfig.default_user_image;
          }
          user.dataValues.cashback_earned = 0;
          res.send(
            setRes(resCode.OK,true,"Get user profile successfully.",user)
          );
        } else {
          res.send(
            setRes(resCode.ResourceNotFound,false,"User not Found.",null)
          );
        }
      })
      .catch((userError) => {
        res.send(
          setRes(
            resCode.InternalServer,
            false,
            "Fail to Get user Profile.",
            null
          )
        );
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
};

exports.UpdateProfile = async (req,res) => {
  var data = req.body;
  var validation = true;
  req.file ? (data.profile_picture = `${req.file.key}`) : "";
  var userModel = models.user;
  const Op = models.Op;
  var requiredFields = _.reject(["id"],(o) => {
    return _.has(data,o);
  });

  if(requiredFields == "") {
    var mobilenumber = /^[0-9]+$/;
    var mailId = data.email;
    var emailFormat = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if(data["username"] && (!data?.username || data?.username?.length > 100)) {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          "Username must be less than 100 characters",
          null
        )
      );
    }
    if(data["email"] && (!mailId || mailId?.match(emailFormat) == null)) {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          "Please enter valid email format.",
          null
        )
      );
    }
    if(
      data["country_id"] &&
      data["mobile"] &&
      (((!data.mobile || _.isEmpty(data.mobile)) && data.country_id) ||
        ((!data.country_id || _.isEmpty(data.country_id)) && data.mobile))
    ) {
      const missingField =
        !data.mobile || _.isEmpty(data.mobile) ? "mobile" : "country";
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          `Please enter valid ${missingField}.`,
          null
        )
      );
    } else if(
      (data.country_id != undefined && _.isEmpty(data.country_id)) ||
      (data.mobile != undefined && _.isEmpty(data.mobile)) ||
      (data["country_id"] && !data["mobile"]) ||
      (!data["country_id"] && data["mobile"])
    ) {
      const missingField =
        !data.mobile || _.isEmpty(data.mobile) ? "mobile" : "country";
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          `Please enter valid ${missingField}.`,
          null
        )
      );
    }
    if(
      data["country_id"] &&
      data["mobile"] &&
      (!data?.mobile ||
        data.mobile.length > 15 ||
        data.mobile.length < 7 ||
        !mobilenumber.test(data.mobile))
    ) {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          "Please enter valid mobile number.",
          null
        )
      );
    }

    userModel
      .findOne({
        where: {
          id: data.id,
          is_deleted: false,
          is_active: true,
        },
      })
      .then(async (user) => {
        if(_.isEmpty(user)) {
          res.send(
            setRes(resCode.ResourceNotFound,false,"User not found.",null)
          );
        } else {
          if(data.profile_picture != null) {
            const params = {
              Bucket: awsConfig.Bucket,
              Key: user.profile_picture,
            };
            awsConfig.deleteImageAWS(params);
          }
          const emailData = await userModel.findOne({
            where: {
              is_deleted: false,
              email: {[Op.eq]: data.email},
              id: {[Op.ne]: data.id},
            },
          });

          if(data["email"] && emailData != null) {
            validation = false;
            return res.send(
              setRes(
                resCode.BadRequest,
                false,
                "This email is already associated with another account !",
                null
              )
            );
          }

          const phoneData = await userModel.findOne({
            where: {
              is_deleted: false,
              country_id: data.country_id || "",
              mobile: {[Op.eq]: data.mobile},
              id: {[Op.ne]: data.id},
            },
          });

          if(data["mobile"] && data["country_id"] && phoneData != null) {
            validation = false;
            return res.send(
              setRes(
                resCode.BadRequest,
                false,
                "This mobile number is already associated with another account !",
                null
              )
            );
          }
          if(validation) {
            if(data.email) {
              const token = jwt.sign(
                {id: user.id,user: data.email,role_id: user.role_id},
                "secret",
                {expiresIn: 480 * 480}
              );
              data.auth_token = token;
            }

            userModel
              .update(data,{
                where: {
                  id: data.id,
                },
              })
              .then(async (user) => {
                if(user == 1) {
                  userModel
                    .findOne({
                      where: {
                        id: data.id,
                        is_deleted: false,
                        is_active: true,
                      },
                      include: [
                        {
                          model: models.countries,
                          attributes: [
                            "id",
                            "country_code",
                            "phone_code",
                            "currency",
                            "currency_symbol",
                          ],
                        },
                      ],
                    })
                    .then(async (userData) => {
                      if(data.profile_picture != null) {
                        var updateData_image = await awsConfig
                          .getSignUrl(data.profile_picture)
                          .then(function(res) {
                            userData.profile_picture = res;
                          });
                      } else if(userData.profile_picture != null) {
                        var old_image = await awsConfig
                          .getSignUrl(userData.profile_picture)
                          .then(function(res) {
                            userData.profile_picture = res;
                          });
                      } else {
                        userData.profile_picture =
                          commonConfig.default_user_image;
                      }

                      res.send(
                        setRes(
                          resCode.OK,
                          true,
                          "User Profile Updated Successfully.",
                          userData
                        )
                      );
                    });
                } else {
                  res.send(
                    setRes(
                      resCode.BadRequest,
                      false,
                      "Fail to Update User Profile.",
                      null
                    )
                  );
                }
              })
              .catch((error) => {
                res.send(
                  setRes(
                    resCode.InternalServer,
                    true,
                    "Internal server error.",
                    null
                  )
                );
              });
          }
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
};

exports.ChangePassword = async (req,res) => {
  var data = req.body;
  var userModel = models.user;
  var requiredFields = _.reject(
    ["id","old_password","new_password","confirm_password"],
    (o) => {
      return _.has(data,o);
    }
  );

  if(requiredFields == "") {
    userModel
      .findOne({
        where: {
          id: data.id,
          is_deleted: false,
        },
      })
      .then((user) => {
        if(user != null) {
          bcrypt.compare(
            data.old_password,
            user.password,
            function(error,isValid) {
              if(!error && isValid == true) {
                if(data.new_password == data.confirm_password) {
                  bcrypt.hash(data.new_password,10).then((hash) => {
                    userModel
                      .update(
                        {
                          password: hash,
                        },
                        {
                          where: {
                            id: data.id,
                          },
                        }
                      )
                      .then((updated) => {
                        if(updated == 1) {
                          res.send(
                            setRes(
                              resCode.OK,
                              true,
                              "Password updated successfully.",
                              null
                            )
                          );
                        } else {
                          res.send(
                            setRes(
                              resCode.BadRequest,
                              false,
                              "Fail to update password.",
                              null
                            )
                          );
                        }
                      });
                  });
                } else {
                  res.send(
                    setRes(
                      resCode.BadRequest,
                      false,
                      "New Password and confirem password not match.",
                      null
                    )
                  );
                }
              } else {
                res.send(
                  setRes(
                    resCode.BadRequest,
                    false,
                    "Old password not match.",
                    null
                  )
                );
              }
            }
          );
        } else {
          res.send(
            setRes(resCode.ResourceNotFound,false,"User not found.",null)
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
};
exports.SendOtp = async (req,res) => {
  var data = req.body;
  var userModel = models.user;

  var requiredFields = _.reject(["email"],(o) => {
    return _.has(data,o);
  });

  if(requiredFields == "") {
    res.send(setRes(resCode.BadRequest));
  } else {
    res.send(
      setRes(
        resCode.BadRequest,
        true,
        requiredFields.toString() + " are required"
      ),
      null
    );
  }
};
exports.forgotPassword = async (req,res) => {
  var data = req.body;
  var userModel = models.user;
  var businessModel = models.business;
  var emailOtpVerifieModel = models.email_otp_verifies;
  var requiredFields = _.reject(["email","role"],(o) => {
    return _.has(data,o);
  });
  if(requiredFields == "") {
    if(data.role == 2) {
      await userModel
        .findOne({
          where: {
            email: data.email,
            role_id: data.role,
            is_deleted: false,
          },
        })
        .then(async (user) => {
          if(user != null) {
            if(user.is_active == false) {
              return res.send(
                setRes(
                  resCode.Unauthorized,
                  false,
                  "Your account has been deactivated. Please contact administrator.",
                  null
                )
              );
            } else {
              const otp = Math.floor(Math.random() * 9000) + 1000;
              var currentDate = new Date();
              var futureDate = new Date(
                currentDate.getTime() + commonConfig.email_otp_expired
              );
              var expire_at = moment
                .utc(futureDate)
                .format("YYYY-MM-DD HH:mm:ss");
              await emailOtpVerifieModel
                .create({
                  user_id: user.id,
                  email: data.email,
                  otp: otp,
                  role_id: data.role,
                  expire_at: expire_at,
                })
                .then(function(OtpData) {
                  if(OtpData) {
                    var transporter = nodemailer.createTransport({
                      host: mailConfig.host,
                      port: mailConfig.port,
                      secure: mailConfig.secure,
                      auth: mailConfig.auth,
                      tls: mailConfig.tls,
                    });
                    var templates = new EmailTemplates();
                    var context = {
                      otp: otp,
                      username: user.username,
                      expire_at: expire_at,
                    };
                    templates.render(
                      path.join(
                        __dirname,
                        "../../",
                        "template",
                        "email-otp.html"
                      ),
                      context,
                      function(err,html,text,subject) {
                        transporter.sendMail(
                          {
                            from: "b.a.s.e. <do-not-reply@mail.com>",
                            to: data.email,
                            subject: "Email OTP Verification",
                            html: html,
                          },
                          function(err,result) {
                            if(err) {
                              return res.send(
                                setRes(
                                  resCode.BadRequsest,
                                  false,
                                  "Something went wrong.",
                                  null
                                )
                              );
                            } else {
                              // return res.send(setRes(resCode.OK, true, `Email has been sent to ${users.email}, with account activation instuction.. `, null));
                              data.otp = otp;
                              data.otp_valid_till = moment
                                .utc(commonConfig.email_otp_expired)
                                .format("mm:ss");
                              data.expire_at = expire_at;
                              if(data.otp_flag == 1) {
                                // Resend otp sent successfully on your email
                                return res.send(
                                  setRes(
                                    resCode.OK,
                                    true,
                                    "Resend otp sent successfully on your email",
                                    data
                                  )
                                );
                              } else {
                                return res.send(
                                  setRes(
                                    resCode.OK,
                                    true,
                                    "We have sent otp to your email address.",
                                    data
                                  )
                                );
                              }
                            }
                          }
                        );
                      }
                    );
                  }
                })
                .catch((err) => {
                  return res.send(
                    setRes(
                      resCode.InternalServer,
                      false,
                      "Internal server error.",
                      null
                    )
                  );
                });
            }
          } else {
            res.send(
              setRes(resCode.ResourceNotFound,false,"User not found.",null)
            );
          }
        });
    } else if(data.role == 3) {
      businessModel
        .findOne({
          where: {
            email: data.email,
            role_id: data.role,
            is_deleted: false,
          },
        })
        .then((user) => {
          if(user != null) {
            if(user.is_active == false) {
              res.send(
                setRes(
                  resCode.Unauthorized,
                  false,
                  "Your account has been deactivated. Please contact administrator.",
                  null
                )
              );
            } else {
              const otp = Math.floor(Math.random() * 9000) + 1000;

              var currentDate = new Date();
              var futureDate = new Date(
                currentDate.getTime() + commonConfig.email_otp_expired
              );
              // var new_date = futureDate.toLocaleString('en-US', { timeZone: 'UTC' });
              var expire_at = moment
                .utc(futureDate)
                .format("YYYY-MM-DD HH:mm:ss");
              emailOtpVerifieModel
                .create({
                  user_id: user.id,
                  email: data.email,
                  otp: otp,
                  role_id: data.role,
                  expire_at: expire_at,
                })
                .then(function(OtpData) {
                  if(OtpData) {
                    var transporter = nodemailer.createTransport({
                      host: mailConfig.host,
                      port: mailConfig.port,
                      secure: mailConfig.secure,
                      auth: mailConfig.auth,
                      tls: mailConfig.tls,
                    });

                    var templates = new EmailTemplates();
                    var context = {
                      otp: otp,
                      username: user.person_name,
                      expire_at: expire_at,
                      logo_image: `../../../public/logo.png`,
                    };
                    templates.render(
                      path.join(
                        __dirname,
                        "../../",
                        "template",
                        "email-otp.html"
                      ),
                      context,
                      function(err,html,text,subject) {
                        transporter.sendMail(
                          {
                            from: "b.a.s.e. <do-not-reply@mail.com>",
                            to: data.email,
                            subject: "Email OTP Verification",
                            html: html,
                          },
                          function(err,result) {
                            if(err) {
                            } else {
                              res.send(
                                setRes(
                                  resCode.OK,
                                  true,
                                  `Email has been sent to ${users.email}, with account activation instuction.. `,
                                  null
                                )
                              );
                            }
                          }
                        );
                      }
                    );
                  }
                  data.otp = otp;
                  data.otp_valid_till = moment
                    .utc(commonConfig.email_otp_expired)
                    .format("mm:ss");
                  data.expire_at = expire_at;
                  if(data.otp_flag == 1) {
                    // Resend otp sent successfully on your email
                    res.send(
                      setRes(
                        resCode.OK,
                        true,
                        "Resend otp sent successfully on your email",
                        data
                      )
                    );
                  } else {
                    res.send(
                      setRes(
                        resCode.OK,
                        true,
                        "We have sent otp to your email address.",
                        data
                      )
                    );
                  }
                })
                .catch((err) => {
                  res.send(
                    setRes(
                      resCode.InternalServer,
                      false,
                      "Internal server error.",
                      null
                    )
                  );
                });
            }
          } else {
            res.send(
              setRes(
                resCode.ResourceNotFound,
                false,
                "Business not found.",
                null
              )
            );
          }
        });
    } else {
      res.send(setRes(resCode.ResourceNotFound,false,"Role Not Found",null));
    }
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
};

exports.OtpVerify = async (req,res) => {
  var data = req.body;
  var emailOtpVerifieModel = models.email_otp_verifies;

  var requiredFields = _.reject(["role","otp"],(o) => {
    return _.has(data,o);
  });

  if(requiredFields == "") {
    await emailOtpVerifieModel
      .findOne({where: {otp: data.otp,role_id: data.role}})
      .then(async (otpUser) => {
        if(otpUser != null) {
          var now_date_time = new Date()
            .toISOString()
            .replace(/T/," ")
            .replace(/\..+/,"");
          var expire_time = moment(otpUser.expire_at).format(
            "YYYY-MM-DD HH:mm:ss"
          );
          if(now_date_time > expire_time) {
            // otpUser.destroy();
            return res.send(
              setRes(resCode.BadRequest,false,"This otp is expired!",null)
            );
          } else {
            if(data.role == 2 || data.role == 3) {
              var roleModel =
                data.role == 2 && data.role != 3
                  ? models.user
                  : models.business;
              var user = await roleModel.findOne({
                where: {email: otpUser.email,is_deleted: false},
              });
              if(user == null) {
                if(data.role == 2 && data.role != 3) {
                  return res.send(
                    setRes(
                      resCode.ResourceNotFound,
                      false,
                      "User not found.",
                      null
                    )
                  );
                } else {
                  return res.send(
                    setRes(
                      resCode.ResourceNotFound,
                      false,
                      "Business not found.",
                      null
                    )
                  );
                }
              } else {
                var response = await sendForgotPasswordMail(user);
                if(response != null && !_.isUndefined(response)) {
                  otpUser.destroy();
                  return res.send(
                    setRes(
                      resCode.OK,
                      true,
                      "An e-mail has been sent to given email address with further instructions.",
                      null
                    )
                  );
                } else {
                  return res.send(
                    setRes(
                      resCode.InternalServer,
                      false,
                      "Mail can't sent.",
                      null
                    )
                  );
                }
              }
            } else {
              return res.send(
                setRes(resCode.BadRequest,false,"Invalid role.",null)
              );
            }
          }
        } else {
          return res.send(
            setRes(resCode.BadRequest,false,"Please enter valid OTP.",null)
          );
        }
      });
  } else {
    return res.send(
      setRes(
        resCode.BadRequest,
        false,
        requiredFields.toString() + " are required",
        null
      )
    );
  }
};

async function sendForgotPasswordMail(user) {
  try {
    const token = await new Promise((resolve,reject) => {
      crypto.randomBytes(20,(err,buf) => {
        if(err) {
          reject(err);
        } else {
          resolve(buf.toString("hex"));
        }
      });
    });

    const newUser = user.update(
      {
        reset_pass_token: token,
        reset_pass_expire: Date.now() + 3600000,
      },
      {
        where: {id: user.id},
      }
    );

    if(newUser === 0) {
      throw new Error("Token not updated");
    }

    const transporter = nodemailer.createTransport({
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      auth: mailConfig.auth,
      tls: mailConfig.tls,
    });

    const templates = new EmailTemplates();
    const context = {
      resetUrl: commonConfig.app_url + "/api/user/resetPassword/" + token,
      username: user.username,
    };

    const result = await new Promise((resolve,reject) => {
      templates.render(
        path.join(__dirname,"../../","template","forgot-password.html"),
        context,
        function(err,html,text,subject) {
          transporter.sendMail(
            {
              from: "b.a.s.e. <do-not-reply@mail.com>",
              to: user.email,
              subject: "Reset Password",
              html: html,
            },
            function(err,result) {
              if(err) {
                reject(err);
              } else {
                resolve(result);
              }
            }
          );
        }
      );
    });

    return result;
  } catch(error) {
    // res.send(setRes(resCode.BadRequest, false, "Something went wrong.",null))
    return null;
  }
}

exports.GetResetPasswordForm = async (req,res) => {
  var token = req.params.token;
  var userModel = models.user;
  var businessModel = models.business;
  var Op = models.Op;

  userModel
    .findOne({
      where: {
        reset_pass_token: token,
        reset_pass_expire: {[Op.gt]: Date.now()},
        is_deleted: 0,
      },
    })
    .then((user) => {
      if(user != null) {
        res.sendFile(
          path.join(__dirname,"../../template","reset-password.html")
        );
      } else {
        businessModel
          .findOne({
            where: {
              reset_pass_token: token,
              reset_pass_expire: {[Op.gt]: Date.now()},
              is_deleted: 0,
            },
          })
          .then((business) => {
            if(business != null) {
              res.sendFile(
                path.join(__dirname,"../../template","reset-password.html")
              );
            } else {
              res.sendFile(
                path.join(__dirname,"../../template","page-expire.html")
              );
            }
          });
      }
    })
    .catch((GetUserError) => {
      res.send(setRes(resCode.BadRequest,null,true,GetUserError.message));
    });
};

exports.UpdatePassword = function(req,res) {
  var token = req.params.token;
  var userModel = models.user;
  var businessModel = models.business;
  var Op = models.Op;

  userModel
    .findOne({
      where: {
        reset_pass_token: token,
        reset_pass_expire: {[Op.gt]: Date.now()},
        is_deleted: 0,
      },
    })
    .then(async (user) => {
      if(user != null) {
        var password = await bcrypt
          .hash(req.body.new_password,10)
          .then((hash) => {
            return hash;
          });

        await userModel
          .update(
            {
              reset_pass_token: null,
              reset_pass_expire: null,
              password: password,
            },
            {
              where: {
                id: user.id,
              },
            }
          )
          .then(async (updateUser) => {
            if(updateUser == 1) {
              res.send(
                setRes(resCode.OK,true,"Password Updated Successfully.",user)
              );
              res.sendFile(
                path.join(__dirname,"../../template","password-update.html")
              );
            } else {
              res.send(
                setRes(
                  resCode.BadRequest,
                  false,
                  "Fail to Update Password.",
                  null
                )
              );
            }
          })
          .catch((UpdateUserError) => {
            res.send(
              setRes(resCode.BadRequest,false,UpdateUserError.message,null)
            );
          });
      } else {
        businessModel
          .findOne({
            where: {
              reset_pass_token: token,
              reset_pass_expire: {[Op.gt]: Date.now()},
              is_deleted: 0,
            },
          })
          .then(async (business) => {
            if(business != null) {
              var password = await bcrypt
                .hash(req.body.new_password,10)
                .then((hash) => {
                  return hash;
                });
              businessModel
                .update(
                  {
                    reset_pass_token: null,
                    reset_pass_expire: null,
                    password: password,
                  },
                  {
                    where: {
                      id: business.id,
                    },
                  }
                )
                .then((updateBusiness) => {
                  if(updateBusiness == 1) {
                    res.send(
                      setRes(
                        resCode.OK,
                        true,
                        "Password Updated Successfully.",
                        business
                      )
                    );
                  } else {
                    res.send(
                      setRes(
                        resCode.BadRequest,
                        false,
                        "Fail to Update Password.",
                        null
                      )
                    );
                  }
                })
                .catch((UpdateBusinessError) => {
                  res.send(
                    setRes(
                      resCode.BadRequest,
                      false,
                      UpdateBusinessError.message,
                      null
                    )
                  );
                });
            } else {
              res.send(
                setRes(
                  resCode.BadRequest,
                  false,
                  "Fail to Update Password.",
                  null
                )
              );
            }
          })
          .catch((GetBusinessError) => {
            res.send(
              setRes(resCode.BadRequest,false,GetBusinessError.message,true)
            );
          });
      }
    })
    .catch((GetUserError) => {
      res.send(
        setRes(resCode.BadRequest,false,"Internal server error.",null)
      );
    });
};

exports.SendFeedback = async (req,res) => {
  var data = req.body;
  var feedbackModel = models.feedback;
  var userModel = models.user;
  var businessModel = models.business;

  var requiredFields = _.reject(["caption","message"],(o) => {
    return _.has(data,o);
  });

  if(requiredFields == "") {
    if(data.user_id) {
      userModel
        .findOne({
          where: {
            id: data.user_id,
            is_deleted: false,
          },
        })
        .then(async (user) => {
          if(user != null) {
            var feedbackRes = await FeedbackMail(user,data);

            if(feedbackRes == "") {
              res.send(
                setRes(
                  resCode.BadRequest,
                  false,
                  "Fail to send feedback email.",
                  null
                )
              );
            } else {
              res.send(
                setRes(
                  resCode.OK,
                  true,
                  "Your feedback has been sended to our team.",
                  feedbackRes
                )
              );
            }
          } else {
            res.send(
              setRes(resCode.ResourceNotFound,false,"User not found.",null)
            );
          }
        })
        .catch((getUserError) => {
          res.send(
            setRes(
              resCode.InternalServer,
              false,
              "Internal server error.",
              null
            )
          );
        });
    } else if(data.business_id) {
      businessModel
        .findOne({
          where: {
            id: data.business_id,
            is_deleted: false,
          },
        })
        .then(async (business) => {
          if(business != null) {
            var feedbackRes = await FeedbackMail(business,data);

            if(feedbackRes == "") {
              res.send(
                setRes(
                  resCode.BadRequest,
                  false,
                  "Fail to send feedback email.",
                  null
                )
              );
            } else {
              res.send(
                setRes(
                  resCode.OK,
                  true,
                  "Your feedback has been sended to our team.",
                  feedbackRes
                )
              );
            }
          } else {
            res.send(
              setRes(
                resCode.ResourceNotFound,
                false,
                "User or Business not found.",
                null
              )
            );
          }
        })
        .catch((getUserError) => {
          res.send(
            setRes(resCode.InternalServer,false,getUserError.message,null)
          );
        });
    } else {
      res.send(
        setRes(
          resCode.BadRequest,
          false,
          "business_id or user_id are required.",
          null
        )
      );
    }
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
};

function FeedbackMail(user,data) {
  var feedbackModel = models.feedback;

  return new Promise((resolve,reject) => {
    async.waterfall(
      [
        function(callback) {
          var transporter = nodemailer.createTransport({
            host: mailConfig.host,
            port: mailConfig.port,
            secure: mailConfig.secure,
            auth: mailConfig.auth,
            tls: mailConfig.tls,
          });

          var templates = new EmailTemplates();
          var context = {
            username: user.username || user.business_name,
            caption: data.caption,
            message: data.message,
          };

          templates.render(
            path.join(
              __dirname,
              "../../",
              "template",
              "customer-feedback.html"
            ),
            context,
            function(err,html,text,subject) {
              transporter.sendMail(
                {
                  from: "b.a.s.e. <do-not-reply@mail.com>",
                  to: "base@yopmail.com",
                  subject: "Feedback From Customer",
                  html: html,
                },
                function(err,result) {
                  if(err) {
                    callback(err);
                  } else {
                    callback(result);
                  }
                }
              );
            }
          );
        },
      ],
      function(result) {
        if(!result) {
          resolve("");
          // res.send(setRes(resCode.BadRequest, null, true, "Fail to send feedback email."))
        } else {
          feedbackModel
            .create(data)
            .then((feedback) => {
              resolve(JSON.parse(JSON.stringify(feedback)));
              // res.send(setRes(resCode.OK, feedback, false, "Your feedback has been sended to our team."))
            })
            .catch((saveFeedbackError) => {
              resolve("");
              // res.send(setRes(resCode.InternalServer, null, true, saveFeedbackError.message))
            });
        }
      }
    );
  });
}

exports.GetAllBusiness = async (req,res) => {
  var data = req.body;
  var businessModel = models.business;
  var Op = models.Op;
  var businesscateogryModel = models.business_categorys;
  var settingModel = models.settings;
  var authUser = req?.user

  var requiredFields = _.reject(["page","page_size"],(o) => {
    return _.has(data,o);
  });

  if(requiredFields == "") {
    if(data.page < 0 || data.page === 0) {
      res.send(
        setRes(
          resCode.BadRequest,
          false,
          "invalid page number, should start with 1",
          null
        )
      );
    }

    var skip = data.page_size * (data.page - 1);
    var limit = parseInt(data.page_size);

    var condition = {
      include: [
        {
          model: businesscateogryModel,
          attributes: ["name"],
        },
        {
          model: settingModel,
          where: {
            setting_key: "working_hours",
          },
          required: false,
        },
      ],
      order: [["createdAt","DESC"]],
      attributes: {
        exclude: [
          "is_deleted",
          "is_enable",
          "auth_token",
          "device_type",
          "role_id",
          "sections",
          "template_id",
          "color_code",
          "approve_by",
          "booking_facility",
          "abn_no",
          "password",
          "account_name",
          "person_name",
          "reset_pass_token",
          "reset_pass_expire",
          "device_token",
          "business_category",
          "account_number",
          "latitude",
          "longitude",
          "email",
          "device_id",
          "phone",
        ],
      },
    };

    if(data.category_id) {
      condition.where = {
        ...condition.where,
        ...{
          category_id: data.category_id,
          is_deleted: false,
          is_active: true,
        },
      };
    } else {
      condition.where = {
        ...condition.where,
        ...{is_deleted: false,is_active: true},
      };
    }
    if(data.search && data.search != null) {
      condition.where = {
        ...condition.where,
        ...{
          [Op.or]: [{business_name: {[Op.like]: "%" + data.search + "%"}}],
        },
      };
    }

    if(data.page_size != 0 && !_.isEmpty(data.page_size)) {
      (condition.offset = skip),(condition.limit = limit);
    }

    var totalRecords = await businessModel.count(condition);

    await businessModel
      .findAll(condition)
      .then(async (businessData) => {
        if(businessData.length > 0) {
          for(const data of businessData) {
            if(data.business_category != null) {
              data.dataValues.category_name = data.business_category.name;
              delete data.dataValues.business_category;
            } else {
              data.dataValues.category_name = "";
            }
            if(data.banner != null) {
              const signurl = await awsConfig
                .getSignUrl(data.banner)
                .then(function(res) {
                  data.banner = res;
                });
            } else {
              data.banner = commonConfig.default_image;
            }
            var FollowUnfollowModel = models.follow_unfollow_businesses;
            var is_followed = false;
            const FollowingBusiness = await FollowUnfollowModel.findOne({
              where: {
                business_id: data.id,
                user_id: authUser.id,
                status: true,
              }
            });
            if(!_.isNull(FollowingBusiness)) {
              is_followed = true
            }
            data.dataValues.is_followed = is_followed;

            if(data.setting != null && data.setting.setting_key == 'working_hours') {
              var date = data.setting.setting_value;
              var arr1 = date.split("_");
              var from = arr1[0] ? moment(arr1[0],"HH:mm").format("hh:mm A") : null;
              var to = arr1[1] ? moment(arr1[1],"HH:mm").format("hh:mm A") : null;
              data.dataValues.available = `${from} - ${to}`;
              delete data.dataValues.setting;
            } else {
              data.dataValues.available = null;
            }
            const selectQuery = `SELECT id,total_rating FROM businesses WHERE id=:business_id`;

            const business = await models.sequelize.query(selectQuery,{
              replacements: {business_id: data.id},
              type: Sequelize.QueryTypes.SELECT,
            });
            data.dataValues.total_rating_business = parseFloat(business[0].total_rating).toFixed(2);
          }
          const response = new pagination(
            businessData,
            totalRecords,
            parseInt(data.page),
            parseInt(data.page_size)
          );
          res.send(
            setRes(
              resCode.OK,
              true,
              "Get Business successfully",
              response.getPaginationInfo()
            )
          );
        } else {
          res.send(
            setRes(resCode.ResourceNotFound,false,"Business not found",null)
          );
        }
      })
      .catch((error) => {
        res.send(
          setRes(resCode.BadRequest,false,"Fail to get business",null)
        );
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
};

exports.Logout = async (req,res) => {
  try {
    const data = req.body;
    var authData = req.user;
    var authModel =
      authData.role_id == 3 && authData.role_id != 2
        ? models.business
        : models.user;
    var Op = models.Op;
    var requiredFields = _.reject(["device_id","device_type"],(o) => {
      return _.has(data,o);
    });

    if(requiredFields == "") {
      //const authHeader = req.headers["authorization"];
      //const TokenData =  jwt.verify(authHeader, 'secret', {expiresIn: 480 * 480})
      //var roleId = TokenData.role_id

      //const authModel = (roleId == 2 && roleId != 3) ? models.user : models.business;
      const user = await authModel.findOne({
        where: {id: authData.id,is_deleted: false,is_active: true},
      });
      if(user) {
        const token = jwt.sign(
          {id: user.id,user: user.email,role_id: user.role_id},
          "secret",
          {expiresIn: 480 * 480}
        );
        delete user.dataValues.auth_token;
        user.dataValues.auth_token = token;
        await authModel
          .update(
            {auth_token: token},
            {
              where: {id: user.id},
            }
          )
          .then(async function(newUser) {
            if(newUser) {
              const deviceModel = models.device_tokens;
              const condition = {};
              if(authData.role_id == 2 && authData.role_id != 3) {
                condition.where = {user_id: user.id};
              } else {
                condition.where = {business_id: user.id};
              }
              //if(data.device_type == 1 && data.device_type != 2){
              //	condition.where = {...condition.where,...{device_type:'ios'}}
              //}else{
              //	condition.where = {...condition.where,...{device_type:'android'}}
              //}
              condition.where = {
                ...condition.where,
                ...{
                  //device_id:data.device_id,
                  status: 1,
                },
              };
              const loginUserDevices = await deviceModel.findOne(condition);
              if(loginUserDevices) {
                await deviceModel.findOne(condition).then(async (Data) => {
                  Data.destroy();
                });
                const deleteData = await loginUserDevices.update({
                  status: 9,
                });
                res.send(setRes(resCode.OK,true,"Logout successfully",null));
              } else {
                res.send(
                  setRes(
                    resCode.BadRequest,
                    false,
                    "Oops not you have not logged in this devices.",
                    null
                  )
                );
              }
            } else {
              res.send(
                setRes(resCode.BadRequest,false,"Can't logged out.",null)
              );
            }
          });
      } else {
        res.send(
          setRes(resCode.ResourceNotFound,false,"User not found.",null)
        );
      }
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
  } catch(error) {
    res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
};

// Home Screeen Details START
exports.homeList = async (req,res) => {
  try {
    var data = req.body;
    var businessModel = models.business;
    var Op = models.Op;
    var currentDate = moment().format("YYYY-MM-DD");
    var currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    var giftCardModel = models.gift_cards;
    var cashbackModel = models.cashbacks;
    var discountModel = models.discounts;
    var couponeModel = models.coupones;
    var loyaltyPointModel = models.loyalty_points;
    var combocalenderModel = models.combo_calendar;
    const userEventsModel = models.user_events;
    var businesscateogryModel = models.business_categorys;
    const productCategoryModel = models.product_categorys;
    const productModel = models.products;
    const userModel = models.user;
    var businessArray = [];
    var eventArray = [];
    var authUser = req.user;
    const promises = [];
    const notificationModel = models.notifications;
    const notificationReceiverModel = models.notification_receivers;
    const unreadNotification = await notificationModel.findAndCountAll({
      include: [
        {
          model: notificationReceiverModel,
          where: {
            is_deleted: false,
            role_id: authUser.role_id,
            receiver_id: authUser.id,
            is_read: false,
          },
          attributes: {exclude: ["created_at","updated_at","deleted_at"]},
        },
      ],
      attributes: {
        exclude: [
          "role_id",
          "notification_type",
          "status",
          "created_at",
          "updated_at",
          "deleted_at",
        ],
      },
      where: {
        notification_type: {
          [Op.ne]: "global_push_notification",
        },
      },
    });
    var FollowUnfollowModel = models.follow_unfollow_businesses;
    businessArray.push(
      await businessModel
        .findAll({
          where: {is_deleted: false,is_active: true},
          attributes: [
            "id",
            "banner",
            "business_name",
            "address",
            "description",
          ]
        })
        .then(async (business) => {
          if(business.length > 0) {
            const dataArray = [];
            for(const data of business) {
              if(data.banner != null) {
                const signurl = await awsConfig
                  .getSignUrl(data.banner)
                  .then(function(res) {
                    data.banner = res;
                  });
              } else {
                data.banner = commonConfig.default_user_image;
              }
              var is_followed = false;
              const FollowingBusiness = await FollowUnfollowModel.findOne({
                where: {
                  business_id: data.id,
                  user_id: authUser.id,
                  status: true,
                }
              });
              if(!_.isNull(FollowingBusiness)) {
                is_followed = true
              }
              data.dataValues.is_followed = is_followed;
            }
            var array = shuffle(business);
            const filteredData = [];

            for(const item of array) {
              if(!item.dataValues.is_followed) {
                filteredData.push(item);
              }
            }
            var slicedArray = filteredData.slice(0,5);
            let result = JSON.parse(JSON.stringify(slicedArray));
            dataArray.push(result);
            return result;
          }
          return [];
        })
    );

    const [businessData] = await Promise.all(businessArray);
    const businessDataArray = businessData;

    promises.push(
      await giftCardModel
        .findAll({
          where: {
            isDeleted: false,
            status: true,
            deleted_at: null,
            expire_at: {
              [Op.gt]: currentDate,
            },
          },
          include: [
            {
              model: businessModel,
              attributes: ["id","business_name","category_id"],
              include: [
                {
                  model: businesscateogryModel,
                  attributes: ["id","name"],
                },
              ],
            },
          ],
          //attributes: [
          //  "id",
          //  "business_id",
          //  "image",
          //  "name",
          //  "amount",
          //  "is_cashback",
          //  "cashback_percentage",
          //  "expire_at",
          //  "createdAt",
          //],
          order: [["createdAt","DESC"]],
        })
        .then(async (giftCardData) => {
          if(giftCardData.length > 0) {
            const dataArray = [];
            // Update Sign URL
            for(const data of giftCardData) {
              if(data.image != null) {
                var images = data.image;
                const signurl = await awsConfig
                  .getSignUrl(images.toString())
                  .then(function(res) {
                    data.image = res;
                  });
              } else {
                data.image = commonConfig.default_image;
              }

              // Gset businesss name
              if(data.business != null) {
                data.dataValues.business_name = data.business.business_name;
              } else {
                data.dataValues.business_name = "";
              }
              if(data.business.business_category != null) {
                data.dataValues.category_name =
                  data.business.business_category.name;
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
      await cashbackModel
        .findAll({
          where: {
            isDeleted: false,
            status: true,
            deleted_at: null,
            validity_for: {
              [Op.gt]: currentDate,
            },
          },
          include: [
            {
              model: productCategoryModel,
              attributes: ["id","name"],
            },
          ],
          order: [["createdAt","DESC"]],
          //attributes: [
          //  "id",
          //  "title",
          //  "cashback_value",
          //  "product_category_id",
          //  "product_id",
          //  "description",
          //  "validity_for",
          //  "createdAt",
          //],
        })
        .then(async (CashbackData) => {
          if(CashbackData.length > 0) {
            const dataArray = [];
            for(const data of CashbackData) {
              let result = JSON.parse(JSON.stringify(data));
              const products = await productModel.findAll({
                where: {id: {[Op.in]: result.product_id?.split(",") || []}},
                attributes: ["name"],
                raw: true,
              });
              const product_name_arr = products?.map((val) => val.name);
              const product_name =
                product_name_arr?.length > 0 ? product_name_arr?.join(",") : "";
              result.product_name = product_name.trim();
              result.product_category_name =
                result?.product_category?.name || "";
              delete result?.product_category;
              result.type = "cashbacks";
              dataArray.push(result);
            }
            return dataArray;
          }
          return [];
        }),
      await discountModel
        .findAll({
          where: {
            isDeleted: false,
            status: true,
            deleted_at: null,
            validity_for: {
              [Op.gt]: currentDate,
            },
          },
          include: [
            {
              model: productCategoryModel,
              attributes: ["id","name"],
            },
          ],
          order: [["createdAt","DESC"]],
          //attributes: [
          //  "id",
          //  "business_id",
          //  "title",
          //  "discount_type",
          //  "discount_value",
          //  "product_category_id",
          //  "product_id",
          //  "validity_for",
          //  "status",
          //  "createdAt",
          //],
        })
        .then(async (DiscountData) => {
          if(DiscountData.length > 0) {
            const dataArray = [];
            for(const data of DiscountData) {
              let result = JSON.parse(JSON.stringify(data));
              const products = await productModel.findAll({
                where: {id: {[Op.in]: result.product_id?.split(",") || []}},
                attributes: ["name"],
                raw: true,
              });
              const product_name_arr = products?.map((val) => val.name);
              const product_name =
                product_name_arr?.length > 0 ? product_name_arr?.join(",") : "";
              result.product_name = product_name.trim();
              result.product_category_name =
                result?.product_category?.name || "";
              delete result?.product_category;
              result.type = "discounts";
              dataArray.push(result);
            }
            return dataArray;
          }
          return [];
        }),
      await couponeModel
        .findAll({
          where: {
            isDeleted: false,
            status: true,
            deleted_at: null,
            expire_at: {
              [Op.gt]: currentDate,
            },
          },
          include: [
            {
              model: productCategoryModel,
              attributes: ["id","name"],
            },
          ],
          order: [["createdAt","DESC"]],
          //attributes: [
          //  "id",
          //  "business_id",
          //  "title",
          //  "coupon_code",
          //  "coupon_type",
          //  "product_category_id",
          //  "product_id",
          //  "value_type",
          //  "coupon_value",
          //  "validity_for",
          //  "expire_at",
          //  "description",
          //  "status",
          //  "createdAt",
          //],
        })
        .then(async (CouponeData) => {
          if(CouponeData.length > 0) {
            const dataArray = [];
            for(const data of CouponeData) {
              let result = JSON.parse(JSON.stringify(data));
              const products = await productModel.findAll({
                where: {id: {[Op.in]: result.product_id?.split(",") || []}},
                attributes: ["name"],
                raw: true,
              });
              const product_name_arr = products?.map((val) => val.name);
              const product_name =
                product_name_arr?.length > 0 ? product_name_arr?.join(",") : "";
              result.product_name = product_name.trim();
              result.product_category_name =
                result?.product_category?.name || "";
              delete result?.product_category;
              result.type = "coupones";
              dataArray.push(result);
            }
            return dataArray;
          }
          return [];
        }),
      await loyaltyPointModel
        .findAll({
          where: {
            isDeleted: false,
            status: true,
            deleted_at: null,
            validity: {
              [Op.gt]: currentDate,
            },
          },
          include: [
            {
              model: productModel,
              attributes: ["id","name","category_id"],
              include: [
                {
                  model: productCategoryModel,
                  attributes: ["id","name"],
                  as: "product_categorys",
                },
              ],
            },
          ],
          order: [["createdAt","DESC"]],
          //attributes: [
          //  "id",
          //  "business_id",
          //  "loyalty_type",
          //  "name",
          //  "points_earned",
          //  "product_id",
          //  "amount",
          //  "points_redeemed",
          //  "validity",
          //  "validity_period",
          //  "status",
          //  "createdAt",
          //],
        })
        .then(async (LoyaltyPointData) => {
          if(LoyaltyPointData.length > 0) {
            const dataArray = [];
            for(const data of LoyaltyPointData) {
              let result = JSON.parse(JSON.stringify(data));
              const products = await productModel.findAll({
                where: {id: {[Op.in]: result.product_id?.split(",") || []}},
                attributes: ["name"],
                raw: true,
              });
              const product_name_arr = products?.map((val) => val.name);
              const product_name =
                product_name_arr?.length > 0 ? product_name_arr?.join(",") : "";
              result.product_name = product_name.trim();

              const giftcards = await models.gift_cards.findAll({where: {id: {[Op.in]: result.gift_card_id?.split(',') || []}},attributes: ["name"],raw: true});
              const giftcards_name_arr = giftcards?.map(val => val.name);
              const giftcards_name = giftcards_name_arr?.length > 0 ? giftcards_name_arr?.join(',') : '';
              result.giftcard_name = giftcards_name.trim();

              result.type = "loyalty_points";
              dataArray.push(result);
            }
            return dataArray;
          }
          return [];
        })
    );
    const [
      giftcardRewards,
      cashbackData,
      discountData,
      couponeData,
      loyaltyData,
    ] = await Promise.all(promises);
    const rewardsAndLoyaltyArray = [
      ...giftcardRewards,
      ...cashbackData,
      ...discountData,
      ...couponeData,
      ...loyaltyData,
    ];
    // const mergedArray = mergeRandomArrayObjects(rewardsAndLoyaltyArray);
    const sortedArray = rewardsAndLoyaltyArray.sort(
      (a,b) => new moment(b.createdAt) - new moment(a.createdAt)
    );
    let result = sortedArray.slice(0,2);

    const userDetails = await userModel.findOne({
      where: {email: req.userEmail,is_deleted: false,is_active: true},
    });
    const userId = userDetails?.id || "";
    eventArray.push(
      await combocalenderModel
        .findAll({
          where: {
            [Op.and]: [
              Sequelize.literal(
                `CONCAT(start_date, ' ', start_time) >= '${currentDateTime}'`
              ),
            ],
            status: {
              [Op.eq]: 1,
            },
            is_deleted: false,
          },
          include: [
            {
              model: userEventsModel,
            },
            {
              model: businessModel,
              where: {
                is_active: true,
                is_deleted: false,
              },
              required: true,
            },
          ],
          attributes: [
            "id",
            "business_id",
            "images",
            "title",
            "description",
            "start_date",
            "end_date",
            "start_time",
            "end_time",
            "status",
          ],
          order: Sequelize.literal(
            "trim(concat(start_date,' ', start_time)) ASC"
          ),
          limit: 5,
        })
        .then(async (event) => {
          if(event.length > 0) {
            const dataArray = [];
            for(const data of event) {
              var event_images = data.images;
              var image_array = [];
              if(event_images != null) {
                for(const data of event_images) {
                  const signurl = await awsConfig
                    .getSignUrl(data)
                    .then(function(res) {
                      image_array.push(res);
                    });
                }
              } else {
                image_array.push(commonConfig.default_image);
              }
              data.dataValues.event_images = image_array;

              data.dataValues.is_user_join = false;
              if(data.user_events && data.user_events?.length > 0) {
                data.dataValues.is_user_join = true;
              }
              delete data.dataValues.user_events;
              delete data.dataValues.business;
              const eventStartDate = moment(
                `${data.start_date} ${data.start_time}`
              );
              const eventEndDate = moment(`${data.end_date} ${data.end_time}`);
              const isStartDatePastDate = moment(eventStartDate).isBefore(
                moment().format("YYYY-MM-DD HH:mm:ss")
              );
              const isEndDatePastDate = moment(eventEndDate).isBefore(
                moment().format("YYYY-MM-DD HH:mm:ss")
              );
              if(data.dataValues.status == 4) {
                data.dataValues.event_status = "Cancelled";
              } else {
                if(isEndDatePastDate && isStartDatePastDate) {
                  data.dataValues.event_status = "Completed";
                } else if(isStartDatePastDate && isEndDatePastDate == false) {
                  data.dataValues.event_status = "Inprogress";
                } else {
                  data.dataValues.event_status = "Pending";
                }
              }
              delete data.dataValues.status;
            }
            let result = JSON.parse(JSON.stringify(event));
            dataArray.push(result);
            return result;
          }
          return [];
        })
    );

    const [eventsData] = await Promise.all(eventArray);
    const eventDataArray = eventsData;
    var unfollowdbusinessArray = [];
    unfollowdbusinessArray.push(
      await businessModel
        .findAll({
          where: {is_deleted: false,is_active: true},
          attributes: [
            "id",
            "banner",
            "business_name",
            "address",
            "description",
          ]
        })
        .then(async (business) => {
          if(business.length > 0) {
            const dataArray = [];
            for(const data of business) {
              if(data.banner != null) {
                const signurl = await awsConfig
                  .getSignUrl(data.banner)
                  .then(function(res) {
                    data.banner = res;
                  });
              } else {
                data.banner = commonConfig.default_user_image;
              }
              var is_followed = false;
              const FollowingBusiness = await FollowUnfollowModel.findOne({
                where: {
                  business_id: data.id,
                  user_id: authUser.id,
                  status: true,
                }
              });
              if(!_.isNull(FollowingBusiness)) {
                is_followed = true
              }
              data.dataValues.is_followed = is_followed;
            }
            var array = shuffle(business);
            const filteredData = [];

            for(const item of array) {
              if(item.dataValues.is_followed) {
                filteredData.push(item);
              }
            }
            var slicedArray = filteredData.slice(0,5);
            let result = JSON.parse(JSON.stringify(slicedArray));
            dataArray.push(result);
            return result;
          }
          return [];
        })
    );

    const [followedbusinessData] = await Promise.all(unfollowdbusinessArray);
    const followedbusinessDataArray = followedbusinessData;

    let resData = {};
    resData.unread_notifications = unreadNotification?.count || 0;
    resData.followed_businesses = followedbusinessDataArray;
    resData.businesses = businessDataArray;
    resData.rewards_and_loyalty = result;
    resData.upcoming_events = eventDataArray;

    res.send(
      setRes(resCode.OK,true,"Get home page details successfully.",resData)
    );
  } catch(error) {
    res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
};

exports.totalGetRewards = async (req,res) => {
  try {
    var authUser = req?.user
    var userModel = models.user

    var userData = await userModel.findOne({
      where: {
        id: authUser?.id,
        is_active: true,
        is_deleted: false
      },
      attributes: ['total_loyalty_points','total_cashbacks']
    });
    return res.send(setRes(resCode.OK,true,"Get User Data successfully",userData));
  } catch(error) {
    return res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
}

function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle.
  while(currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex],array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}
// Home Screeen Details END
// =========================================Online STORE START=========================================
// Rewards List START
/**
 * User: Online Store Reward Older api
 */
exports.rewardsListOlder = async (req,res) => {
  try {
    var data = req.body;
    var giftCardModel = models.gift_cards;
    var cashbackModel = models.cashbacks;
    var discountModel = models.discounts;
    var couponeModel = models.coupones;
    var Op = models.Op;
    const promises = [];
    var requiredFields = _.reject(["business_id","page","page_size"],(o) => {
      return _.has(data,o);
    });

    if(requiredFields == "") {
      if(data.page < 0 || data.page == 0) {
        return res.send(
          setRes(
            resCode.BadRequest,
            false,
            "invalid page number, should start with 1",
            null
          )
        );
      }

      let skip = data.page_size * (data.page - 1);
      let limit = parseInt(data.page_size);
      var currentDate = moment().format("YYYY-MM-DD");

      promises.push(
        giftCardModel
          .findAll({
            where: {
              isDeleted: false,
              status: true,
              deleted_at: null,
              expire_at: {
                [Op.gt]: currentDate,
              },
            },
          })
          .then(async (giftCardData) => {
            if(giftCardData.length > 0) {
              const dataArray = [];
              // Update Sign URL
              for(const data of giftCardData) {
                if(data.image != null) {
                  var images = data.image;
                  const signurl = await awsConfig
                    .getSignUrl(images.toString())
                    .then(function(res) {
                      data.image = res;
                    });
                } else {
                  data.image = commonConfig.default_image;
                }
                let result = JSON.parse(JSON.stringify(data));
                result.type = "gift_cards";
                dataArray.push(result);
              }
              return dataArray;
            }
            return [];
          }),
        cashbackModel
          .findAll({
            where: {
              isDeleted: false,
              status: true,
              business_id: data.business_id,
              deleted_at: null,
              validity_for: {
                [Op.gt]: currentDate,
              },
            },
          })
          .then(async (CashbackData) => {
            if(CashbackData.length > 0) {
              const dataArray = [];
              for(const data of CashbackData) {
                let result = JSON.parse(JSON.stringify(data));
                result.type = "cashbacks";
                dataArray.push(result);
              }
              return dataArray;
            }
            return [];
          }),
        discountModel
          .findAll({
            where: {
              isDeleted: false,
              status: true,
              business_id: data.business_id,
              deleted_at: null,
              validity_for: {
                [Op.gt]: currentDate,
              },
            },
          })
          .then(async (DiscountData) => {
            if(DiscountData.length > 0) {
              const dataArray = [];
              for(const data of DiscountData) {
                let result = JSON.parse(JSON.stringify(data));
                result.type = "discounts";
                dataArray.push(result);
              }
              return dataArray;
            }
            return [];
          }),
        couponeModel
          .findAll({
            where: {
              isDeleted: false,
              status: true,
              business_id: data.business_id,
              deleted_at: null,
              expire_at: {
                [Op.gt]: currentDate,
              },
            },
          })
          .then(async (CouponeData) => {
            if(CouponeData.length > 0) {
              const dataArray = [];
              for(const data of CouponeData) {
                let result = JSON.parse(JSON.stringify(data));
                result.type = "coupones";
                dataArray.push(result);
              }
              return dataArray;
            }
            return [];
          })
      );

      const [giftcardRewards,cashbackData,discountData,couponeData] =
        await Promise.all(promises);

      const arrays = [giftcardRewards,cashbackData,discountData,couponeData];
      const mergedArray = mergeRandomArrayObjects(arrays);
      let result = mergedArray.slice(skip,skip + limit);
      res.send(
        setRes(resCode.OK,true,"Get rewards list successfully.",result)
      );
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
  } catch(error) {
    res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
};

/**
 * User: Online Store Reward Latest api
 */
exports.rewardsList = async (req,res) => {
  try {
    const data = req.body;
    const giftCardModel = models.gift_cards;
    const cashbackModel = models.cashbacks;
    const discountModel = models.discounts;
    const couponeModel = models.coupones;
    const Op = models.Op;
    const currentDate = moment().format("YYYY-MM-DD");
    const requiredFields = _.reject(["page","business_id"],(o) => {
      return _.has(data,o);
    });

    var adminRevenueModel = models.admin_revenue;
    const adminRevenue = await adminRevenueModel.findOne({
      where: {
        setting_key: 'admin_revenues',
      }
    })

    if(requiredFields == "") {
      if(!data?.page || +data.page <= 0) {
        return res.send(
          setRes(
            resCode.BadRequest,
            null,
            false,
            "invalid page number, should start with 1"
          )
        );
      }
      var typeArr = ["gift_cards","cashbacks","discounts","coupones"];
      let request_type =
        data?.type?.includes(",") && data?.type?.split(",").length > 0
          ? data?.type?.split(",")
          : data?.type && data?.type?.trim() !== ""
            ? [data?.type]
            : typeArr;
      request_type = request_type.filter((tp) => tp && tp.trim() !== "");
      const requestTypeNotExists = request_type.filter(
        (tp) => !typeArr.includes(tp) && tp !== ""
      );
      if(request_type && requestTypeNotExists.length !== 0) {
        return res.send(
          setRes(resCode.BadRequest,false,"Please select valid type.",null)
        );
      }
      // if((request_type) && !(typeArr.includes(request_type))){
      // 	return res.send(setRes(resCode.BadRequest, null, false, "Please select valid type."))
      // }

      // Total limit for all records
      const limit = 15;
      const perTableLimit = Math.ceil(limit / (request_type.length || 4));
      const lastTableLimit =
        request_type.length % 2 != 0 ? perTableLimit : perTableLimit - 1;
      const giftCardLoyaltyCondition = data.search
        ? {
          [Op.or]: [
            {
              name: {
                [Op.like]: "%" + data.search + "%",
              },
            },
          ],
        }
        : {};

      const cashBackDiscountCouponCondition = data.search
        ? {
          [Op.or]: [
            {
              title: {
                [Op.like]: "%" + data.search + "%",
              },
            },
          ],
        }
        : {};
      const bussinessIdCond = data.business_id
        ? {
          business_id: data.business_id,
        }
        : {};

      let giftCardsRecords,cashbackRecords,discountRecords,couponeRecords;
      let remainingGiftcardRecordLimit = 0,
        remainingCashbackRecordLimit = 0,
        remainingDiscountRecordLimit = 0,
        remainingCouponRecordLimit = 0;
      /**
       * Fetch Gift cards and calculate and forward to next module not fetched record limit
       */
      if(request_type.includes("gift_cards")) {
        giftCardsRecords = await giftCardModel.findAndCountAll({
          offset: perTableLimit * (data.page - 1),
          limit: perTableLimit,
          where: {
            isDeleted: false,
            status: true,
            expire_at: {
              [Op.gt]: currentDate,
            },
            ...bussinessIdCond,
            ...giftCardLoyaltyCondition,
          },
          attributes: {
            include: [
              [models.sequelize.literal("'gift_cards'"),"type"],
              [models.sequelize.literal(`'${adminRevenue?.setting_value}'`),"admin_revenue"],
            ],
          },
        });

        const fetchedGiftCardsCount = giftCardsRecords?.rows?.length || 0;
        remainingGiftcardRecordLimit =
          perTableLimit - fetchedGiftCardsCount > 0
            ? perTableLimit - fetchedGiftCardsCount
            : 0;
      }

      /**
       * Fetch Cashback records and calculate and forward to next module not fetched record limit
       */
      if(request_type.includes("cashbacks")) {
        cashbackRecords = await cashbackModel.findAndCountAll({
          offset: perTableLimit * (data.page - 1),
          limit: perTableLimit + remainingGiftcardRecordLimit,
          where: {
            isDeleted: false,
            status: true,
            validity_for: {
              [Op.gt]: currentDate,
            },
            ...bussinessIdCond,
            ...cashBackDiscountCouponCondition,
          },
          attributes: {
            include: [
              [models.sequelize.literal("'cashbacks'"),"type"],
              [models.sequelize.literal(`'${adminRevenue?.setting_value}'`),"admin_revenue"]
            ],
          },
        });
        for(const data of cashbackRecords?.rows) {
          const products = await models.products.findAll({where: {id: {[Op.in]: data.product_id?.split(',') || []}},attributes: ["name"],raw: true});
          const product_name_arr = products?.map(val => val.name);
          const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
          data.dataValues.product_name = product_name.trim();
        }
        const fetchedCashbackCount = cashbackRecords?.rows?.length || 0;
        remainingCashbackRecordLimit =
          perTableLimit + remainingGiftcardRecordLimit - fetchedCashbackCount >
            0
            ? perTableLimit +
            remainingGiftcardRecordLimit -
            fetchedCashbackCount
            : 0;
      }
      // -----------------------------------------------------------------------------

      /**
       * Fetch discount records and calculate and forward to next module not fetched record limit
       */
      if(request_type.includes("discounts")) {
        discountRecords = await discountModel.findAndCountAll({
          offset: perTableLimit * (data.page - 1),
          limit: perTableLimit + remainingCashbackRecordLimit,
          where: {
            isDeleted: false,
            status: true,
            validity_for: {
              [Op.gt]: currentDate,
            },
            ...bussinessIdCond,
            ...cashBackDiscountCouponCondition,
          },
          attributes: {
            include: [
              [models.sequelize.literal("'discounts'"),"type"],
              [models.sequelize.literal(`'${adminRevenue?.setting_value}'`),"admin_revenue"]
            ],
          },
        });

        for(const data of discountRecords?.rows) {
          const products = await models.products.findAll({where: {id: {[Op.in]: data.product_id?.split(',') || []}},attributes: ["name"],raw: true});
          const product_name_arr = products?.map(val => val.name);
          const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
          data.dataValues.product_name = product_name.trim();
        }

        const fetchedDiscountCount = discountRecords?.rows?.length || 0;
        remainingDiscountRecordLimit =
          perTableLimit + remainingCashbackRecordLimit - fetchedDiscountCount >
            0
            ? perTableLimit +
            remainingCashbackRecordLimit -
            fetchedDiscountCount
            : 0;
      }
      // -----------------------------------------------------------------------------

      /**
       *  Fetch coupon records and calculate and forward to next module not fetched record limit
       */
      if(request_type.includes("coupones")) {
        couponeRecords = await couponeModel.findAndCountAll({
          offset: lastTableLimit * (data.page - 1),
          limit: lastTableLimit + remainingDiscountRecordLimit,
          where: {
            isDeleted: false,
            status: true,
            expire_at: {
              [Op.gt]: currentDate,
            },
            ...bussinessIdCond,
            ...cashBackDiscountCouponCondition,
          },
          attributes: {
            include: [
              [models.sequelize.literal("'coupones'"),"type"],
              [models.sequelize.literal(`'${adminRevenue?.setting_value}'`),"admin_revenue"]
            ],
          },
        });

        for(const data of couponeRecords?.rows) {
          const products = await models.products.findAll({where: {id: {[Op.in]: data.product_id?.split(',') || []}},attributes: ["name"],raw: true});
          const product_name_arr = products?.map(val => val.name);
          const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
          data.dataValues.product_name = product_name.trim();
        }

        const fetchedCouponCount = couponeRecords?.rows?.length || 0;
        remainingCouponRecordLimit =
          perTableLimit + remainingDiscountRecordLimit - fetchedCouponCount > 0
            ? perTableLimit + remainingDiscountRecordLimit - fetchedCouponCount
            : 0;
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

      const total_records =
        totalGiftCardRecords +
        totalCashbackRecords +
        totalDiscountRecords +
        totalCouponRecords;
      const totalPages = Math.ceil(total_records / limit);
      const currentPage = +data.page;
      const per_page = limit;
      const lastPage = totalPages;
      const previousPage = currentPage - 1 <= 0 ? null : currentPage - 1;
      const nextPage = currentPage + 1 > lastPage ? null : currentPage + 1;

      const arrays = [
        fetchedGiftCardsRecords,
        fetchedCashbackRecords,
        fetchedDiscountRecords,
        fetchedCouponRecords,
      ];

      // const [giftcardRewards,cashbackData,discountData,couponeData,loyaltyPointData] = await Promise.all(promises);

      // const arrays = [giftcardRewards, cashbackData,discountData,couponeData,loyaltyPointData];

      const mergedArray = mergeRandomArrayObjects(arrays);
      // let result =  mergedArray.slice(skip, skip+limit);
      const result = mergedArray;
      // if(!(_.isEmpty(request_type))){
      // 	result = _.filter(result, {type: request_type})
      // }
      //let resData = {};
      //resData.data = result;

      //resData.total_records = total_records;
      //resData.totalPages = totalPages;
      //resData.currentPage = currentPage;
      //resData.per_page = per_page;
      //resData.nextPage = nextPage;
      //resData.previousPage = previousPage;
      //resData.lastPage = lastPage;
      const response = new pagination(
        result,
        total_records,
        parseInt(data.page),
        parseInt(data.page_size)
      );
      res.send(
        setRes(
          resCode.OK,
          true,
          "Get rewards list successfully",
          response.getPaginationInfo()
        )
      );
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
  } catch(error) {
    console.log(error)
    res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
};

function mergeRandomArrayObjects(arrays) {
  const shuffledArrays = _.shuffle(arrays);
  const mergedArray = [];

  _.each(shuffledArrays,function(array) {
    _.each(array,function(obj) {
      _.extend(obj,{random: Math.random()});
      mergedArray.push(obj);
    });
  });
  return mergedArray.sort(
    (a,b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}
// Rewards List END

// Rewards View START
exports.rewardsView = async (req,res) => {
  try {
    var data = req.params;
    var paramType = req.query.type;
    var giftCardModel = models.gift_cards;
    var cashbackModel = models.cashbacks;
    var discountModel = models.discounts;
    var couponeModel = models.coupones;
    var Op = models.Op;
    var currentDate = moment().format("YYYY-MM-DD");

    var typeArr = ["gift_cards","cashbacks","discounts","coupones"];
    if(paramType && !typeArr.includes(paramType)) {
      return res.send(
        setRes(resCode.BadRequest,false,"Please select valid type.",null)
      );
    } else {
      if(paramType == "gift_cards") {
        giftCardModel
          .findOne({
            where: {
              id: data.id,
              status: true,
              isDeleted: false,
              expire_at: {
                [Op.gt]: currentDate,
              },
            },
          })
          .then(async (giftCardData) => {
            if(giftCardData != null) {
              if(giftCardData.image != null) {
                var giftCardData_image = await awsConfig
                  .getSignUrl(giftCardData.image)
                  .then(function(res) {
                    giftCardData.image = res;
                  });
              } else {
                giftCardData.image = commonConfig.default_image;
              }
              res.send(
                setRes(
                  resCode.OK,
                  true,
                  "Get virtual card detail successfully.",
                  giftCardData
                )
              );
            } else {
              res.send(
                setRes(
                  resCode.ResourceNotFound,
                  false,
                  "Virtual card not found.",
                  null
                )
              );
            }
          })
          .catch((error2) => {
            res.send(
              setRes(
                resCode.InternalServer,
                false,
                "Internal server error.",
                null
              )
            );
          });
      } else if(paramType == "cashbacks") {
        cashbackModel
          .findOne({
            where: {
              id: data.id,
              status: true,
              isDeleted: false,
              validity_for: {
                [Op.gt]: currentDate,
              },
            },
          })
          .then(async (cashbackData) => {
            if(cashbackData != null) {
              res.send(
                setRes(
                  resCode.OK,
                  true,
                  "Get cashbacks detail successfully.",
                  cashbackData
                )
              );
            } else {
              res.send(
                setRes(
                  resCode.ResourceNotFound,
                  false,
                  "Cashback not found.",
                  null
                )
              );
            }
          })
          .catch((error3) => {
            res.send(
              setRes(
                resCode.InternalServer,
                false,
                "Internal server error.",
                null
              )
            );
          });
      } else if(paramType == "discounts") {
        discountModel
          .findOne({
            where: {
              id: data.id,
              status: true,
              isDeleted: false,
              deleted_at: null,
              validity_for: {
                [Op.gt]: currentDate,
              },
            },
          })
          .then(async (discountData) => {
            if(discountData != null) {
              res.send(
                setRes(
                  resCode.OK,
                  true,
                  "Get Discount detail successfully.",
                  discountData
                )
              );
            } else {
              res.send(
                setRes(
                  resCode.ResourceNotFound,
                  false,
                  "Discount not found.",
                  null
                )
              );
            }
          })
          .catch((error4) => {
            res.send(
              setRes(
                resCode.InternalServer,
                false,
                "Internal server error.",
                null
              )
            );
          });
      } else if(paramType == "coupones") {
        couponeModel
          .findOne({
            where: {
              id: data.id,
              status: true,
              isDeleted: false,
              deleted_at: null,
              expire_at: {
                [Op.gt]: currentDate,
              },
            },
          })
          .then(async (couponeData) => {
            if(couponeData != null) {
              res.send(
                setRes(
                  resCode.OK,
                  true,
                  "Get Coupones detail successfully.",
                  couponeData
                )
              );
            } else {
              res.send(
                setRes(
                  resCode.ResourceNotFound,
                  false,
                  "Coupon not found.",
                  null
                )
              );
            }
          })
          .catch((error5) => {
            res.send(
              setRes(
                resCode.InternalServer,
                false,
                "Internal server error.",
                null
              )
            );
          });
      } else {
        res.send(
          setRes(resCode.BadRequest,false,"Please select valid type.",null)
        );
      }
    }
  } catch(error) {
    res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
};

// Rewards View END

// Loyalty List START
exports.loyaltyList = async (req,res) => {
  try {
    var data = req.body;
    var loyaltyPointModel = models.loyalty_points;
    var businessModel = models.business;
    var productModel = models.products;
    const Op = models.Op;
    var currentDate = moment().format("YYYY-MM-DD");
    var requiredFields = _.reject(["business_id","page","page_size"],(o) => {
      return _.has(data,o);
    });
    if(requiredFields == "") {
      if(data.page < 0 || data.page == 0) {
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

      await loyaltyPointModel
        .findAll({
          offset: skip,
          limit: limit,
          where: {
            isDeleted: false,
            status: true,
            business_id: data.business_id,
            validity: {
              [Op.gte]: currentDate,
            },
          },
          include: [
            {
              model: businessModel,
              attributes: ["id","business_name"],
            },
            {
              model: productModel,
              attributes: ["id","name"],
            },
          ],
        })
        .then(async (loyaltyData) => {
          if(loyaltyData.length > 0) {
            const loyaltyRecordCounts = await loyaltyPointModel.findAndCountAll(
              {
                where: {
                  isDeleted: false,
                  status: true,
                  business_id: data.business_id,
                  validity: {
                    [Op.gt]: currentDate,
                  },
                },
                include: [
                  {
                    model: businessModel,
                    attributes: ["id","business_name"],
                  },
                  {
                    model: productModel,
                    attributes: ["id","name"],
                  },
                ],
              }
            );
            const totalRecords = loyaltyRecordCounts?.count;
            for(const data of loyaltyData) {
              // Get businesss name
              if(data.business != null) {
                data.dataValues.business_name = data.business.business_name;
                delete data.dataValues.business;
              } else {
                data.dataValues.business_name = "";
              }
              const products = await productModel.findAll({where: {id: {[Op.in]: data.product_id?.split(',') || []}},attributes: ["name"],raw: true});
              const product_name_arr = products?.map(val => val.name);
              const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
              data.dataValues.product_name = product_name.trim();

              const giftcards = await models.gift_cards.findAll({where: {id: {[Op.in]: data.gift_card_id?.split(',') || []}},attributes: ["name"],raw: true});
              const giftcards_name_arr = giftcards?.map(val => val.name);
              const giftcards_name = giftcards_name_arr?.length > 0 ? giftcards_name_arr?.join(',') : '';
              data.dataValues.giftcard_name = giftcards_name.trim();
              // Get products name
              //if(data.product != null) {
              //  data.dataValues.product_name = data.product.name;
              //  delete data.dataValues.product;
              //} else {
              //  data.dataValues.product_name = "";
              //}
              delete data.dataValues.product;
            }
            const response = new pagination(
              loyaltyData,
              totalRecords,
              parseInt(data.page),
              parseInt(data.page_size)
            );
            res.send(
              setRes(
                resCode.OK,
                true,
                "Get loyalty list successfully",
                response.getPaginationInfo()
              )
            );
          } else {
            res.send(
              setRes(resCode.ResourceNotFound,false,"Loyalty not found",null)
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
  } catch(error) {
    res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
};
// Loyalty List END

// Loyalty View START
exports.loyaltyView = async (req,res) => {
  try {
    var data = req.params;
    var loyaltyPointModel = models.loyalty_points;
    var businessModel = models.business;
    var productModel = models.products;
    const Op = models.Op;

    var currentDate = moment().format("YYYY-MM-DD");
    loyaltyPointModel
      .findOne({
        where: {
          isDeleted: false,
          status: true,
          id: data.id,
          deleted_at: null,
          validity: {
            [Op.gt]: currentDate,
          },
        },
        include: [
          {
            model: businessModel,
            attributes: ["id","business_name"],
          },
          {
            model: productModel,
            attributes: ["id","name"],
          },
        ],
      })
      .then(async (loyaltyData) => {
        if(loyaltyData) {
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
            setRes(resCode.ResourceNotFound,false,"Loyalty not found",null)
          );
        }
      });
  } catch(error) {
    res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
};
// Loyalty List END

// Business BIO START
exports.businessBIO = async (req,res) => {
  var data = req.query;
  var businessModel = models.business;
  var businessCategory = models.business_categorys;
  var cmsModels = models.cms_pages;
  var settingModel = models.settings;
  await businessModel
    .findOne({
      where: {id: data.business_id,is_active: true,is_deleted: false},
      attributes: ["id","business_name","description"],
      include: [
        {
          model: businessCategory,
          attributes: ["id","name"],
        },
        {
          model: settingModel,
          attributes: ["id","setting_value"],
        },
      ],
    })
    .then(async (bio) => {
      if(bio != null) {
        //  Category name Get
        if(bio.business_category != null) {
          bio.dataValues.business_category_name = bio.business_category.name;
          delete bio.dataValues.business_category;
        } else {
          bio.dataValues.business_category_name = "";
        }

        //  Opening Time
        if(bio.setting != null && data.setting_key == 'working_hours') {
          var date = bio.setting.setting_value;
          var arr1 = date.split("_");
          var from = arr1[0] ? moment(arr1[0],"HH:mm").format("hh:mm A") : null;
          var to = arr1[1] ? moment(arr1[1],"HH:mm").format("hh:mm A") : null;
          bio.dataValues.available = `${from} - ${to}`;
        } else {
          bio.dataValues.available = null;
        }

        const TAndC = await cmsModels.findOne({
          where: {
            business_id: data.business_id,
            is_deleted: false,
            is_enable: true,
            page_key: "terms_of_service",
          },
        });

        // Terms And Conditions GET
        if(TAndC != null && !_.isEmpty(TAndC)) {
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
          setRes(resCode.ResourceNotFound,false,"Bussiness not found.",null)
        );
      }
    });
};
// Business BIO END
// =========================================Online STORE END=========================================

// Business event list
exports.businessEventList = async (req,res) => {
  try {
    var data = req.body;
    var combocalenderModel = models.combo_calendar;
    const userEventsModel = models.user_events;
    const userModel = models.user;
    const businesModel = models.business;
    // const userEmail = req.userEmail;
    var currentDate = moment().format("YYYY-MM-DD");
    var Op = models.Op;
    var requiredFields = _.reject(["page","page_size"],(o) => {
      return _.has(data,o);
    });
    var currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    // const userDetails = await userModel.findOne({ where: { email: userEmail, is_deleted: false, is_active: true } });
    const user = req?.user || {};
    const userId = user?.id ? user.id : "";
    if(requiredFields == "") {
      if(data.page < 0 || data.page == 0) {
        return res.send(
          setRes(
            resCode.BadRequest,
            false,
            "invalid page number, should start with 1",
            null
          )
        );
      }

      let skip = data.page_size * (data.page - 1);
      let limit = parseInt(data.page_size);
      var condition = {
        include: [
          {
            model: userEventsModel,
            where: {
              user_id: userId,
              is_deleted: false,
            },
            required: false,
          },
          {
            model: businesModel,
            where: {
              is_active: true,
              is_deleted: false,
            },
            required: true,
          },
        ],
        order: [
          Sequelize.literal("trim(concat(start_date,' ', start_time)) ASC"),
        ],
      };
      condition.where = {
        is_deleted: false,
        end_date: {
          [Op.gte]: currentDate,
        },
        [Op.and]: [
          Sequelize.literal(
            `CONCAT(start_date, ' ', start_time) >= '${currentDateTime}'`
          ),
        ],
      };
      if(data.search) {
        condition.where = {
          ...condition.where,
          ...{[Op.or]: [{title: {[Op.like]: "%" + data.search + "%"}}]},
        };
      }
      if(data.business_id) {
        condition.where = {
          ...condition.where,
          ...{business_id: data.business_id},
        };
      }
      if(data.page_size != 0 && !_.isEmpty(data.page_size)) {
        (condition.offset = skip),(condition.limit = limit);
      }
      await combocalenderModel.findAll(condition).then(async (event) => {
        const dataArray = [];
        for(const data of event) {
          var event_images = data.images;
          var image_array = [];
          if(event_images != null) {
            for(const data of event_images) {
              const signurl = await awsConfig
                .getSignUrl(data)
                .then(function(res) {
                  image_array.push(res);
                });
            }
          } else {
            image_array.push(commonConfig.default_image);
          }
          data.dataValues.event_images = image_array;
          delete data.dataValues.business;
          data.dataValues.is_user_join = false;
          if(data.dataValues.user_events?.length > 0) {
            data.dataValues.is_user_join = true;
          }
          delete data.dataValues.user_events;
        }
        const recordCount = await combocalenderModel.findAndCountAll(condition);
        const totalRecords = recordCount?.count;
        const response = new pagination(
          event,
          parseInt(totalRecords),
          parseInt(data.page),
          parseInt(data.page_size)
        );
        res.send(
          setRes(
            resCode.OK,
            true,
            "Business Event List successfully",
            response.getPaginationInfo()
          )
        );
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
  } catch(error) {
    res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
};

// Register user in event
exports.eventUserRegister = async (req,res) => {
  try {
    var data = req.body;
    var businessModel = models.business;
    var comboModel = models.combo_calendar;
    var userModel = models.user;
    var eventUserModel = models.user_events;
    const notificationModel = models.notifications;
    const notificationReceiverModel = models.notification_receivers;
    const deviceModel = models.device_tokens;
    const user = req?.user;

    const Op = models.Op;
    var validation = true;
    var currentDate = moment().format("YYYY-MM-DD");
    var requiredFields = _.reject(
      ["business_id","event_id","user_id"],
      (o) => {
        return _.has(data,o);
      }
    );
    let businessDetails,eventDetails,userDetails;
    if(requiredFields == "") {
      if(data.business_id) {
        await businessModel
          .findOne({
            where: {id: data.business_id,is_deleted: false,is_active: true},
          })
          .then(async (business) => {
            if(_.isEmpty(business)) {
              validation = false;
              return res.send(
                setRes(
                  resCode.ResourceNotFound,
                  false,
                  "Business not found.",
                  null
                )
              );
            }
            businessDetails = business;
          });
      }

      if(data.event_id) {
        var condition = {};
        if(!_.isEmpty(data.business_id)) {
          condition.where = {business_id: data.business_id};
        }
        condition.where = {
          //...condition.where,
          ...{id: data.event_id,is_deleted: false},
        };
        await comboModel.findOne(condition).then(async (event) => {
          if(_.isEmpty(event)) {
            validation = false;
            return res.send(
              setRes(resCode.ResourceNotFound,false,"Event not found.",null)
            );
          }
          eventDetails = event;
        });
      }

      if(data.user_id) {
        await userModel
          .findOne({
            where: {id: data.user_id,is_deleted: false,is_active: true},
          })
          .then(async (user) => {
            if(_.isEmpty(user)) {
              validation = false;
              return res.send(
                setRes(resCode.ResourceNotFound,false,"User not found.",null)
              );
            }
            userDetails = user;
          });
      }

      const isUserExist = await eventUserModel.findOne({
        where: {
          user_id: data.user_id,
          event_id: data.event_id,
          business_id: data.business_id,
          is_deleted: false,
          is_available: true,
        },
      });

      if(isUserExist) {
        validation = false;
        return res.send(
          setRes(
            resCode.BadRequest,
            false,
            "User already registred in this business event.",
            null
          )
        );
      }
      if(validation) {
        await eventUserModel
          .create(data)
          .then(async (event_user) => {
            if(event_user) {
              /** Notification object created */
              const notificationObj = {
                params: JSON.stringify({
                  notification_type: NOTIFICATION_TYPES.EVENT_USER_JOIN,
                  title: NOTIFICATION_TITLES.EVENT_USER_JOIN(),
                  message: NOTIFICATION_MESSAGE.EVENT_USER_JOIN(
                    eventDetails?.title,
                    userDetails?.username
                  ),
                  event_id: data.event_id,
                  user_id: user.id,
                  business_id: businessDetails.id,
                }),
                title: NOTIFICATION_TITLES.EVENT_USER_JOIN(),
                message: NOTIFICATION_MESSAGE.EVENT_USER_JOIN(
                  eventDetails?.title,
                  userDetails?.username
                ),
                notification_type: NOTIFICATION_TYPES.EVENT_USER_JOIN,
              };
              const notification = await notificationModel.create(
                notificationObj
              );
              if(notification && notification.id) {
                const notificationReceiverObj = {
                  role_id: businessDetails.role_id,
                  notification_id: notification.id,
                  receiver_id: businessDetails.id,
                };
                const notificationReceiver =
                  await notificationReceiverModel.create(
                    notificationReceiverObj
                  );
              }
              /** FCM push noifiation */
              const activeReceiverDevices = await deviceModel.findAll(
                {where: {status: 1,business_id: businessDetails.id}},
                {attributes: ["device_token"]}
              );
              const deviceTokensList = activeReceiverDevices.map(
                (device) => device.device_token
              );
              const uniqueDeviceTokens = Array.from(new Set(deviceTokensList));
              const notificationPayload = {
                device_token: uniqueDeviceTokens,
                title: NOTIFICATION_TITLES.EVENT_USER_JOIN(),
                message: NOTIFICATION_MESSAGE.EVENT_USER_JOIN(
                  eventDetails?.title,
                  userDetails?.username
                ),
                content: {
                  notification_type: NOTIFICATION_TYPES.EVENT_USER_JOIN,
                  notification_id: notification.id,
                  title: NOTIFICATION_TITLES.EVENT_USER_JOIN(),
                  message: NOTIFICATION_MESSAGE.EVENT_USER_JOIN(
                    eventDetails?.title,
                    userDetails?.username
                  ),
                  event_id: data.event_id,
                  user_id: user.id,
                  business_id: businessDetails.id,
                },
              };
              fcmNotification.SendNotification(notificationPayload);

              res.send(
                setRes(
                  resCode.OK,
                  true,
                  "You are successfully register in this event.",
                  event_user
                )
              );
            }
          })
          .catch((error) => {
            res.send(
              setRes(
                resCode.BadRequest,
                false,
                "Fail to register in this event!",
                null
              )
            );
          });
      }
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
  } catch(error) {
    res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
};

// User Event Listing API
exports.userEventList = async (req,res) => {
  var data = req.body;
  var combocalenderModel = models.combo_calendar;
  const businesModel = models.business;
  var userEventModel = models.user_events;
  var currentDate = moment().format("YYYY-MM-DD");
  var Op = models.Op;
  var requiredFields = _.reject(["page","page_size","user_id"],(o) => {
    return _.has(data,o);
  });
  if(requiredFields == "") {
    if(data.page < 0 || data.page == 0) {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          "invalid page number, should start with 1",
          null
        )
      );
    }
    let skip = data.page_size * (data.page - 1);
    let limit = parseInt(data.page_size);

    var condition = {
      attributes: [
        "id",
        "business_id",
        "images",
        "title",
        "description",
        "start_date",
        "end_date",
        "start_time",
        "end_time",
        "status",
        "location",
      ],
      include: [
        {
          model: userEventModel,
          attributes: ["id","user_id","createdAt"],
          as: "user_events",
          where: {user_id: data.user_id,is_deleted: false},
          include: [
            {
              model: models.user,
              attributes: [
                "id",
                "username",
                "email",
                "mobile",
                "profile_picture",
              ],
            },
          ],
        },
        {
          model: businesModel,
          where: {
            is_active: true,
            is_deleted: false,
          },
          required: true,
        },
      ],
      order: [
        ["user_events","createdAt","DESC"],
        // ['status','ASC'],
        // ['start_date','ASC'],
        // ['start_time','ASC'],
      ],
    };
    condition.where = {
      is_deleted: false,
      //end_date: {
      //  [Op.gt]: currentDate,
      //},
    };
    if(!_.isEmpty(data.search)) {
      condition.where = {
        ...condition.where,
        ...{
          [Op.or]: [
            {
              title: {
                [Op.like]: "%" + data.search + "%",
              },
            },
          ],
        },
      };
    }

    if(!_.isEmpty(data.from_date) && !_.isEmpty(data.to_date)) {
      var startDate = moment(data.from_date).format("YYYY-MM-DD");
      var endDate = moment(data.to_date).format("YYYY-MM-DD");
      condition.where = {
        ...condition.where,
        ...{
          [Op.or]: [
            {
              start_date: {
                [Op.between]: [startDate,endDate],
              },
            },
            {
              [Op.and]: [
                {
                  start_date: {
                    [Op.lte]: currentDate,
                  },
                },
                {
                  end_date: {
                    [Op.gte]: currentDate,
                  },
                },
              ],
            },
          ],
        },
      };
    }

    if(data.page_size != 0 && !_.isEmpty(data.page_size)) {
      (condition.offset = skip),(condition.limit = limit);
    }

    combocalenderModel.findAll(condition).then(async (event) => {
      if(event.length > 0) {
        const dataArray = [];
        for(const data of event) {
          var event_images = data.images;
          var image_array = [];
          if(event_images != null) {
            for(const data of event_images) {
              const signurl = await awsConfig
                .getSignUrl(data)
                .then(function(res) {
                  image_array.push(res);
                });
            }
          } else {
            image_array.push(commonConfig.default_image);
          }
          data.dataValues.event_images = image_array;
          delete data.dataValues.business;
        }
        const recordCount = await combocalenderModel.findAndCountAll(condition);
        const totalRecords = recordCount?.count;
        const response = new pagination(
          event,
          parseInt(totalRecords),
          parseInt(data.page),
          parseInt(data.page_size)
        );
        res.send(
          setRes(
            resCode.OK,
            true,
            "User business event list successfully",
            response.getPaginationInfo()
          )
        );
      } else {
        res.send(
          setRes(resCode.ResourceNotFound,false,"Event not found",[])
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
};

// User Leave API
exports.eventUserLeave = async (req,res) => {
  try {
    var data = req.body;
    var businessModel = models.business;
    var comboModel = models.combo_calendar;
    var userModel = models.user;
    var eventUserModel = models.user_events;
    var combocalenderModel = models.combo_calendar;
    const notificationModel = models.notifications;
    const notificationReceiverModel = models.notification_receivers;
    const deviceModel = models.device_tokens;
    const user = req?.user;
    var validation = true;
    const Op = models.Op;
    var currentDate = moment().format("YYYY-MM-DD");
    var requiredFields = _.reject(
      ["id","business_id","event_id","user_id"],
      (o) => {
        return _.has(data,o);
      }
    );
    let businessDetails,userDetails;
    if(data) {
      if(requiredFields == "") {
        const eventDetails = await combocalenderModel.findOne({
          where: {id: data.event_id},
        });
        await eventUserModel
          .findOne({
            where: {id: data.id,is_deleted: false,is_available: true},
          })
          .then(async (event_user) => {
            if(_.isEmpty(event_user)) {
              validation = false;
              return res.send(
                setRes(
                  resCode.ResourceNotFound,
                  false,
                  "User Event not found.",
                  null
                )
              );
            }
          });

        if(data.business_id && validation == true) {
          await businessModel
            .findOne({
              where: {
                id: data.business_id,
                is_deleted: false,
                is_active: true,
              },
            })
            .then(async (business) => {
              if(_.isEmpty(business)) {
                validation = false;
                return res.send(
                  setRes(
                    resCode.ResourceNotFound,
                    false,
                    "Business not found.",
                    null
                  )
                );
              }
              businessDetails = business;
            });
        }

        if(data.event_id && validation == true) {
          var condition = {};
          //if(!_.isEmpty(data.business_id)) {
          //  condition.where = {business_id: data.business_id};
          //}
          condition.where = {
            //...condition.where,
            ...{
              id: data.event_id,
              is_deleted: false,
              //end_date: {
              //  [Op.gt]: currentDate,
              //},
            },
          };
          await comboModel.findOne(condition).then(async (event) => {
            if(_.isEmpty(event)) {
              validation = false;
              return res.send(
                setRes(
                  resCode.ResourceNotFound,
                  false,
                  "Event not found.",
                  null
                )
              );
            }
          });
        }

        if(data.user_id && validation == true) {
          await userModel
            .findOne({
              where: {id: data.user_id,is_deleted: false,is_active: true},
            })
            .then(async (user) => {
              if(_.isEmpty(user)) {
                validation = false;
                return res.send(
                  setRes(
                    resCode.ResourceNotFound,
                    false,
                    "User not found.",
                    null
                  )
                );
              }
              userDetails = user;
            });
        }

        const eventUserData = await eventUserModel.findOne({
          where: {
            id: data.id,
            business_id: data.business_id,
            event_id: data.event_id,
            user_id: data.user_id,
            is_deleted: false,
            is_available: true,
          },
        });
        if(_.isEmpty(eventUserData) && validation == true) {
          validation = false;
          return res.send(
            setRes(
              resCode.ResourceNotFound,
              false,
              "User not found in any event.",
              null
            )
          );
        }

        if(validation) {
          await eventUserModel
            .update(
              {
                is_deleted: true,
                is_available: false,
              },
              {
                where: {
                  id: data.id,
                  business_id: data.business_id,
                  event_id: data.event_id,
                  user_id: data.user_id,
                  is_deleted: false,
                  is_available: true,
                },
              }
            )
            .then(async (dataVal) => {
              if(dataVal) {
                /** Notification object created */
                const notificationObj = {
                  params: JSON.stringify({
                    notification_type: NOTIFICATION_TYPES.EVENT_USER_LEAVE,
                    title: NOTIFICATION_TITLES.EVENT_USER_LEAVE(),
                    message: NOTIFICATION_MESSAGE.EVENT_USER_LEAVE(
                      eventDetails?.title,
                      userDetails?.username
                    ),
                    event_id: data.event_id,
                    user_id: user.id,
                    business_id: businessDetails.id,
                  }),
                  title: NOTIFICATION_TITLES.EVENT_USER_LEAVE(),
                  message: NOTIFICATION_MESSAGE.EVENT_USER_LEAVE(
                    eventDetails?.title,
                    userDetails?.username
                  ),
                  notification_type: NOTIFICATION_TYPES.EVENT_USER_LEAVE,
                };
                const notification = await notificationModel.create(
                  notificationObj
                );
                if(notification && notification.id) {
                  const notificationReceiverObj = {
                    role_id: businessDetails.role_id,
                    notification_id: notification.id,
                    receiver_id: businessDetails.id,
                  };
                  const notificationReceiver =
                    await notificationReceiverModel.create(
                      notificationReceiverObj
                    );
                }
                /** FCM push noifiation */
                const activeReceiverDevices = await deviceModel.findAll(
                  {where: {status: 1,business_id: businessDetails.id}},
                  {attributes: ["device_token"]}
                );
                const deviceTokensList = activeReceiverDevices.map(
                  (device) => device.device_token
                );
                const uniqueDeviceTokens = Array.from(
                  new Set(deviceTokensList)
                );
                const notificationPayload = {
                  device_token: uniqueDeviceTokens,
                  title: NOTIFICATION_TITLES.EVENT_USER_LEAVE(),
                  message: NOTIFICATION_MESSAGE.EVENT_USER_LEAVE(
                    eventDetails?.title,
                    userDetails?.username
                  ),
                  content: {
                    notification_type: NOTIFICATION_TYPES.EVENT_USER_LEAVE,
                    notification_id: notification.id,
                    title: NOTIFICATION_TITLES.EVENT_USER_LEAVE(),
                    message: NOTIFICATION_MESSAGE.EVENT_USER_LEAVE(
                      eventDetails?.title,
                      userDetails?.username
                    ),
                    event_id: data.event_id,
                    user_id: user.id,
                    business_id: businessDetails.id,
                  },
                };
                fcmNotification.SendNotification(notificationPayload);
                await eventUserModel
                  .findOne({
                    where: {id: data.id},
                  })
                  .then(async (user_data) => {
                    return res.send(
                      setRes(
                        resCode.OK,
                        true,
                        "Leave successfully from event",
                        user_data
                      )
                    );
                  });
              }
            })
            .catch((error) => {
              return res.send(
                setRes(
                  resCode.BadRequest,
                  false,
                  "Fail to leave from event.",
                  null
                )
              );
            });
        }
      } else {
        return res.send(
          setRes(
            resCode.BadRequest,
            false,
            requiredFields.toString() + " are required",
            null
          )
        );
      }
    } else {
      return res.send(
        setRes(resCode.BadRequest,false,"Id are required",null)
      );
    }
  } catch(error) {
    return res.send(
      setRes(resCode.BadRequest,false,"Something went wrong!",null)
    );
  }
};

// Purchase gift card  START
exports.userGiftCardPurchase = async (req,res) => {
  try {
    const Op = models.Op;
    const data = req.body;
    const user = req?.user;
    const userModel = models.user;
    const giftCardModel = models.gift_cards;
    const userGiftCardModel = models.user_giftcards;
    const rewardHistoryModel = models.reward_history;
    const notificationModel = models.notifications;
    const notificationReceiverModel = models.notification_receivers;
    const deviceModel = models.device_tokens;

    const currentDate = moment().format("YYYY-MM-DD");
    var requiredFields = _.reject(
      [
        "gift_card_id",
        "payment_id",
        "payment_status",
        "payment_response",
        "amount",
        "qty",
      ],
      (o) => {
        return _.has(data,o);
      }
    );

    const userDetails = await userModel.findOne({
      where: {id: user.id,is_active: true,is_deleted: false},
    });
    if(!userDetails) {
      return res.send(
        setRes(resCode.ResourceNotFound,false,"User not found.",null)
      );
    }
    if(requiredFields == "") {
      if(![1,2,3,4].includes(+data.payment_status)) {
        return res.send(
          setRes(
            resCode.BadRequest,
            false,
            "Invalid value for Payment status.",
            null
          )
        );
      }

      // check gift card expire or not
      const giftCardDetails = await giftCardModel.findOne({
        where: {id: data.gift_card_id,status: true,isDeleted: false},
      });
      if(giftCardDetails) {
        let giftCardImage = "";
        const img = await awsConfig
          .getSignUrl(giftCardDetails.image,180)
          .then(function(res) {
            giftCardImage = res;
          });
        const giftCardObj = {
          gift_card_id: data.gift_card_id,
          amount: data.amount,
          user_id: userDetails.id,
          business_id: giftCardDetails.business_id,
          purchase_date: currentDate,
          redeemed_amount: data.redeemed_amount,
          payment_status: data.payment_status,
          payment_id: data.payment_id,
          local_time: data.local_time,
          timezone: data.timezone,
          payment_response:
            data.payment_response && typeof data.payment_response != "string"
              ? JSON.stringify(data.payment_response)
              : data.payment_response,
          qty: 1,
          giftcard_amount: giftCardDetails.amount,
          stripe_fee: data.stripe_fee ?? null,
          business_revenue: data.business_revenue ?? null,
          admin_revenue: data.admin_revenue ?? null,

          // is_email_sent: true
        };

        const userCashbackLoyalty = await userModel.findOne({
          where: {
            id: userDetails.id,
            is_deleted: false,
          },
        });

        //for(let i = 1;i <= +(data.qty);i++) {
        var gCard = await userGiftCardModel.create(giftCardObj);




        /*********************/
        if(giftCardDetails.is_cashback == true) {
          const giftcardcashbackamount = (
            (giftCardDetails.amount * giftCardDetails.cashback_percentage) /
            100
          ).toFixed(2);
          const usercashback = userCashbackLoyalty.total_cashbacks || 0.0;
          const usertotalCashback =
            parseFloat(usercashback) + parseFloat(giftcardcashbackamount);

          const updateCashback = userCashbackLoyalty.update({
            total_cashbacks: usertotalCashback,
          });

          const cashbackReward = await rewardHistoryModel.create({
            giftcard_id: giftCardDetails.id,
            user_id: userDetails.id,
            user_gift_card_id: gCard.id,
            credit_debit: true,
            amount: giftcardcashbackamount,
            reference_reward_type: 'cashbacks'
          });

          if(cashbackReward) {
            // send to User ON PURCHASE GIFTCARD
            const notificationCashbackUserObj = {
              role_id: 3,
              params: JSON.stringify({
                notification_type: NOTIFICATION_TYPES.CASHBACK_REWARD,
                title: NOTIFICATION_TITLES.CASHBACK_REWARD(),
                message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(giftCardDetails.name,`${giftCardDetails.cashback_percentage}%`,'virtual card'),
                giftcard_id: giftCardDetails?.id,
                business_id: giftCardDetails.business_id
              }),
              title: NOTIFICATION_TITLES.CASHBACK_REWARD(),
              message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(giftCardDetails.name,`${giftCardDetails.cashback_percentage}%`,'virtual card'),
              notification_type: NOTIFICATION_TYPES.CASHBACK_REWARD,
            }
            const notificationCashbackUser = await notificationModel.create(notificationCashbackUserObj);
            if(notificationCashbackUser) {
              const notificationReceiverCashbackObj = {
                role_id: 2,
                notification_id: notificationCashbackUser.id,
                sender_id: giftCardDetails.business_id,
                receiver_id: user.id,
                is_read: false
              }
              const notificationCashbackReceiver = await notificationReceiverModel.create(notificationReceiverCashbackObj);
              /** FCM push noifiation */
              const activeUserReceiverDevices = await deviceModel.findOne({where: {status: 1,user_id: user.id}},{attributes: ["device_token"]});
              // const userDeviceTokensList = activeUserReceiverDevices.map((device) => device.device_token);
              // const userUniqueDeviceTokens = Array.from(new Set(userDeviceTokensList))
              const userLoyaltyNotificationPayload = {
                device_token: activeUserReceiverDevices?.device_token,
                title: NOTIFICATION_TITLES.CASHBACK_REWARD(),
                message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(giftCardDetails.name,`${giftCardDetails.cashback_percentage}%`,'virtual card'),
                content: {notification_type: NOTIFICATION_TYPES.CASHBACK_REWARD,notification_id: notificationCashbackUser?.id,title: NOTIFICATION_TITLES.CASHBACK_REWARD(),message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(giftCardDetails.name,`${giftCardDetails.cashback_percentage}%`,'virtual card'),giftcard_id: giftCardDetails?.id,business_id: giftCardDetails.business_id}
              };
              await fcmNotification.SendNotification(userLoyaltyNotificationPayload);
            }
          }
        }

        const loyaltyPointModel = models.loyalty_points;
        // LOyalty on order 
        const loyalty = await loyaltyPointModel.findOne({
          attributes: {
            exclude: ["createdAt","updatedAt","deleted_at","isDeleted"],
          },
          where: {
            //gift_card_id: {
            //  [Op.regexp]: `(^|,)${giftCardDetails.id}(,|$)`,
            //},
            status: true,
            loyalty_type: false,
            business_id: giftCardDetails.business_id,
            points_redeemed: true,
            isDeleted: false,
            amount: {
              [Op.lte]: data.amount
            },
            validity: {
              [Op.gte]: currentDate,
            },
          },
          order: [
            ["amount","DESC"],
            ["updatedAt","DESC"]
          ],
        });
        if(loyalty != null) {
          console.log('loyalty')
          if(loyalty.points_redeemed == true && loyalty) {
            const giftcardloyaltyamount = loyalty.points_earned || 0.0;
            const userloyalty =
              userCashbackLoyalty.total_loyalty_points || 0.0;
            const usertotalLoyalty =
              parseFloat(userloyalty) + parseFloat(giftcardloyaltyamount);
            const updateCashback = userCashbackLoyalty.update({
              total_loyalty_points: usertotalLoyalty,
            });
          }

          const loayaltyReward = await rewardHistoryModel.create({
            giftcard_id: giftCardDetails.id,
            user_id: userDetails.id,
            user_gift_card_id: gCard.id,
            credit_debit: true,
            amount: loyalty.points_earned,
            reference_reward_id: loyalty.id,
            reference_reward_type: 'loyalty_points'
          });

          if(loayaltyReward) {
            // send to User ON PURCHASE GIFTCARD
            const notificationLoyaltyUserObj = {
              role_id: 3,
              params: JSON.stringify({
                notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
                title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyalty.points_earned,'virtual card',giftCardDetails.name),
                loyalty_id: loyalty?.id,
                business_id: giftCardDetails.business_id
              }),
              title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
              message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyalty.points_earned,'virtual card',giftCardDetails.name),
              notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
            }
            const notificationLoyaltyUser = await notificationModel.create(notificationLoyaltyUserObj);
            if(notificationLoyaltyUser) {
              const notificationReceiverLoyaltyObj = {
                role_id: 2,
                notification_id: notificationLoyaltyUser.id,
                sender_id: giftCardDetails.business_id,
                receiver_id: user.id,
                is_read: false
              }
              const notificationLoyaltyReceiver = await notificationReceiverModel.create(notificationReceiverLoyaltyObj);
              /** FCM push noifiation */
              const activeUserReceiverDevices = await deviceModel.findOne({where: {status: 1,user_id: user.id}},{attributes: ["device_token"]});
              // const userDeviceTokensList = activeUserReceiverDevices.map((device) => device.device_token);
              // const userUniqueDeviceTokens = Array.from(new Set(userDeviceTokensList))
              const userLoyaltyNotificationPayload = {
                device_token: activeUserReceiverDevices?.device_token,
                title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyalty.points_earned,'virtual card',giftCardDetails.name),
                content: {
                  notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
                  notification_id: notificationLoyaltyUser?.id,
                  title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                  message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyalty.points_earned,'virtual card',giftCardDetails.name),
                  giftcard_id: giftCardDetails?.id,
                  business_id: giftCardDetails.business_id
                }
              };
              await fcmNotification.SendNotification(userLoyaltyNotificationPayload);
            }
          }
        }
        //}

        // LOyalty on Product 
        const loyaltyOnProduct = await loyaltyPointModel.findOne({
          attributes: {
            exclude: ["createdAt","updatedAt","deleted_at","isDeleted"],
          },
          where: {
            gift_card_id: {
              [Op.regexp]: `(^|,)${giftCardDetails.id}(,|$)`,
            },
            status: true,
            loyalty_type: true,
            business_id: giftCardDetails.business_id,
            points_redeemed: true,
            isDeleted: false,
            //amount: {
            //  [Op.gte]: data.amount
            //}
            validity: {
              [Op.gte]: currentDate,
            },
          },
          order: [
            ["amount","DESC"]
          ],
        });
        if(loyaltyOnProduct != null) {
          console.log('loyaltyOnProduct')
          if(loyaltyOnProduct.points_redeemed == true && loyaltyOnProduct) {
            const giftcardloyaltyamount = loyaltyOnProduct.points_earned || 0.0;
            const userloyalty =
              userCashbackLoyalty.total_loyalty_points || 0.0;
            const usertotalLoyalty =
              parseFloat(userloyalty) + parseFloat(giftcardloyaltyamount);
            const updateCashback = userCashbackLoyalty.update({
              total_loyalty_points: usertotalLoyalty,
            });
          }

          const loayaltyReward = await rewardHistoryModel.create({
            giftcard_id: giftCardDetails.id,
            user_id: userDetails.id,
            user_gift_card_id: gCard.id,
            credit_debit: true,
            amount: loyaltyOnProduct.points_earned,
            reference_reward_id: loyaltyOnProduct.id,
            reference_reward_type: 'loyalty_points'
          });

          if(loayaltyReward) {
            // send to User ON PURCHASE GIFTCARD
            const notificationLoyaltyUserObj = {
              role_id: 3,
              params: JSON.stringify({
                notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
                title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyaltyOnProduct.points_earned,'virtual card',giftCardDetails.name),
                loyalty_id: loyalty?.id,
                business_id: giftCardDetails.business_id
              }),
              title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
              message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyaltyOnProduct.points_earned,'virtual card',giftCardDetails.name),
              notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
            }
            const notificationLoyaltyUser = await notificationModel.create(notificationLoyaltyUserObj);
            if(notificationLoyaltyUser) {
              const notificationReceiverLoyaltyObj = {
                role_id: 2,
                notification_id: notificationLoyaltyUser.id,
                sender_id: giftCardDetails.business_id,
                receiver_id: user.id,
                is_read: false
              }
              const notificationLoyaltyReceiver = await notificationReceiverModel.create(notificationReceiverLoyaltyObj);
              /** FCM push noifiation */
              const activeUserReceiverDevices = await deviceModel.findOne({where: {status: 1,user_id: user.id}},{attributes: ["device_token"]});
              // const userDeviceTokensList = activeUserReceiverDevices.map((device) => device.device_token);
              // const userUniqueDeviceTokens = Array.from(new Set(userDeviceTokensList))
              const userLoyaltyNotificationPayload = {
                device_token: activeUserReceiverDevices?.device_token,
                title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyaltyOnProduct.points_earned,'virtual card',giftCardDetails.name),
                content: {
                  notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
                  notification_id: notificationLoyaltyUser?.id,
                  title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                  message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyaltyOnProduct.points_earned,'virtual card',giftCardDetails.name),
                  giftcard_id: giftCardDetails?.id,
                  business_id: giftCardDetails.business_id
                }
              };
              await fcmNotification.SendNotification(userLoyaltyNotificationPayload);
            }
          }
        }

        if(data?.use_redeem_points) {
          //const userWalletAmounts = await userModel.findOne({where: {id: user.id},attributes: ["total_loyalty_points","total_cashbacks"]});

          //if(parseInt(userWalletAmounts.total_loyalty_points) < parseInt(data?.use_redeem_points?.amount)) {
          //  throw new Error('Insufficient amount of cashback for loyalty points request');
          //} else {
          //Redeem loyalty points from user and create debit transaction
          if(data?.use_redeem_points?.amount && data?.use_redeem_points?.amount > 0 && data?.use_redeem_points?.is_used) {
            const rewardLoyaltyPointsDebit = await rewardHistoryModel.create({
              giftcard_id: data.gift_card_id,
              credit_debit: false,
              user_id: user.id,
              user_gift_card_id: gCard.id,
              amount: data?.use_redeem_points?.amount,
              reference_reward_type: 'loyalty_points'
            });

            const userCashbackUpdate = await userModel.update({
              total_loyalty_points: models.sequelize.literal(`total_loyalty_points - ${data?.use_redeem_points?.amount}`)
            },
              {
                where: {
                  id: user.id
                }
              });
          }
          //}
        }

        if(data?.use_cashback) {
          //const userWalletAmounts = await userModel.findOne({where: {id: user.id},attributes: ["total_loyalty_points","total_cashbacks"]});

          //if(parseInt(userWalletAmounts.total_cashbacks) > parseInt(data?.use_cashback?.amount)) {
          //  return res.send(
          //    setRes(
          //      resCode.BadRequest,
          //      false,
          //      "Insufficient amount of cashback for user request.",
          //      null
          //    )
          //  );
          //  //throw new Error('Insufficient amount of cashback for user request');
          //} else {
          // Redeem cashback amount from user and create debit transaction
          if(data?.use_cashback?.amount && data?.use_cashback?.amount > 0 && data?.use_cashback?.is_used) {
            const rewardCashbackDebit = await rewardHistoryModel.create({
              giftcard_id: data.gift_card_id,
              credit_debit: false,
              user_gift_card_id: gCard.id,
              user_id: user.id,
              amount: data?.use_cashback?.amount,
              reference_reward_type: 'cashbacks'
            });

            const userCashbackUpdate = await userModel.update({
              total_cashbacks: models.sequelize.literal(`total_cashbacks - ${data?.use_cashback?.amount}`)
            },
              {
                where: {
                  id: user.id
                }
              });
          }
          //}
        }

        if(data.qty && +data.qty > 0) {
          const createdGiftCards = [];
          // for(let i = 0; i < +(data.qty); i++){

          const createRewardHistory = await rewardHistoryModel.create({
            amount: data.amount,
            giftcard_id: gCard.gift_card_id,
            user_id: user.id,
            user_gift_card_id: gCard.id,
            credit_debit: true,
            reference_reward_id: gCard.gift_card_id,
            reference_reward_type: "gift_cards",
          });

          createdGiftCards.push(gCard);
          /** Send Email Notification to user */
          const transporter = nodemailer.createTransport({
            host: mailConfig.host,
            port: mailConfig.port,
            secure: mailConfig.secure,
            auth: mailConfig.auth,
            tls: mailConfig.tls,
          });

          const templates = new EmailTemplates({
            juice: {
              webResources: {
                images: false,
              },
            },
          });
          const expiryDate = moment(giftCardDetails.expire_at).format(
            "MM-DD-YYYY"
          );
          const context = {
            userName: userDetails.username,
            giftCardName: giftCardDetails.name,
            giftCardAmount: giftCardDetails.amount,
            note: data.note,
            giftCardUrl: `${giftCardImage}`,
            expireDate: expiryDate,
            giftCardQty: data.qty || 1,
          };

          templates.render(
            path.join(
              __dirname,
              "../../",
              "template",
              "gift-card-purchased.html"
            ),
            context,
            (err,html,text,subject) => {
              transporter.sendMail(
                {
                  from: "b.a.s.e. <do-not-reply@mail.com>",
                  to: userDetails.email,
                  subject: `B.a.s.e Virtual card`,
                  html: html,
                },
                function(err,result) {
                  if(err) {
                    console.log("mail error",err);
                  }
                }
              );
            }
          );
          /** END Send Email Notification to user */

          /** Send Puch Notification */
          const notificationObj = {
            params: JSON.stringify({
              notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
              title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
                userDetails?.username
              ),
              message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
                userDetails?.username,
                giftCardDetails?.name
              ),
              giftcard_id: data.gift_card_id,
              user_id: user.id,
              business_id: giftCardDetails.business_id,
            }),
            title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
              userDetails?.username
            ),
            message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
              userDetails?.username,
              giftCardDetails?.name
            ),
            notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
          };
          const notification = await notificationModel.create(notificationObj);
          if(notification && notification.id) {
            const notificationReceiverObj = {
              role_id: 3,
              notification_id: notification.id,
              receiver_id: giftCardDetails.business_id,
              is_read: false,
            };
            const notificationReceiver = await notificationReceiverModel.create(
              notificationReceiverObj
            );
          }
          /** FCM push noifiation */
          const activeReceiverDevices = await deviceModel.findAll(
            {where: {status: 1,business_id: giftCardDetails.business_id}},
            {attributes: ["device_token"]}
          );
          const deviceTokensList = activeReceiverDevices.map(
            (device) => device.device_token
          );
          const uniqueDeviceTokens = Array.from(new Set(deviceTokensList));
          const notificationPayload = {
            device_token: uniqueDeviceTokens,
            title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
              userDetails?.username
            ),
            message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
              userDetails?.username,
              giftCardDetails?.name
            ),
            content: {
              notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
              notification_id: notification.id,
              title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
                userDetails?.username
              ),
              message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
                userDetails?.username,
                giftCardDetails?.name
              ),
              giftcard_id: data.gift_card_id,
              user_id: user.id,
              business_id: giftCardDetails.business_id,
            },
          };
          await fcmNotification.SendNotification(notificationPayload);
          /** END Puch Notification */
          // }
          res.send(
            setRes(
              resCode.OK,
              true,
              "Virtual Card Purchased successfully!",
              createdGiftCards
            )
          );
        } else {
          return res.send(
            setRes(resCode.BadRequest,false,"Invald Qty value.",null)
          );
        }
      } else {
        return res.send(
          setRes(
            resCode.ResourceNotFound,
            false,
            "Virtual card not found.",
            null
          )
        );
      }
    } else {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          requiredFields.toString() + " are required",
          null
        )
      );
    }
  } catch(error) {
    console.log(error)
    return res.send(
      setRes(resCode.BadRequest,false,"Something went wrong!",null)
    );
  }
};
// Purchase gift card  END

// Purchase gift card  START
exports.userGiftCardShare = async (req,res) => {
  try {
    const data = req.body;
    const userModel = models.user;
    const giftCardModel = models.gift_cards;
    const userGiftCardModel = models.user_giftcards;
    const giftCardTemplateModel = models.gift_card_template;
    // const userEmail = req.userEmail;
    const Op = models.Op;
    const user = req?.user;
    const userEmail = user?.user;
    const notificationModel = models.notifications;
    const notificationReceiverModel = models.notification_receivers;
    const deviceModel = models.device_tokens;
    const rewardHistoryModel = models.reward_history;
    const currentDate = moment().format("YYYY-MM-DD");
    const bussinessModel = models.business;
    var requiredFields = _.reject(
      [
        "gift_card_id",
        "gift_card_template_id",
        "gift_for",
        "from",
        "note",
        "to_email",
        "payment_id",
        "payment_status",
        "payment_response",
        "amount",
        "qty",
      ],
      (o) => {
        return _.has(data,o);
      }
    );

    const userDetails = await userModel.findOne({
      where: {email: userEmail,is_active: true,is_deleted: false},
    });
    if(!userDetails) {
      return res.send(
        setRes(resCode.ResourceNotFound,false,"User not found.",null)
      );
    }

    //for scheduled email
    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const scheduledDateTime = moment(data.schedule_datetime).format(
      "YYYY-MM-DD HH:mm:ss"
    );
    const isScheduleDateFutureDate =
      moment(currentDateTime).isBefore(scheduledDateTime);

    if(
      data?.schedule_datetime &&
      data?.schedule_datetime != "" &&
      !moment(data.schedule_datetime).isValid()
    ) {
      return res.send(
        setRes(resCode.BadRequest,false,"Invalid Schedule date time.",null)
      );
    }
    if(
      data?.schedule_datetime &&
      !moment(data.schedule_datetime).isValid() &&
      !isScheduleDateFutureDate
    ) {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          "Schedule date time should be future date time.",
          null
        )
      );
    }

    if(data.note && data.note.length >= 250) {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          "Please enter 250 characters description.",
          null
        )
      );
    }
    if(requiredFields == "") {
      if(![1,2,3,4].includes(+data.payment_status)) {
        return res.send(
          setRes(
            resCode.BadRequest,
            false,
            "Invalid value for Payment status.",
            null
          )
        );
      }

      const giftCardTemplate = await giftCardTemplateModel.findOne({
        where: {
          id: data.gift_card_template_id,
          is_enable: true,
          is_deleted: false,
        },
      });
      if(!giftCardTemplate) {
        return res.send(
          setRes(
            resCode.ResourceNotFound,
            false,
            "Virtual card Template not found.",
            null
          )
        );
      }
      // check gift card expire or not
      const giftCardDetails = await giftCardModel.findOne({
        where: {id: data.gift_card_id},
      });
      let giftCardImage = "";
      let giftCardTemplateUrl = "";
      const img = await awsConfig
        .getSignUrl(giftCardDetails.image,180)
        .then(function(res) {
          giftCardImage = res;
        });
      const imgGiftTemplate = await awsConfig
        .getSignUrl(giftCardTemplate.template_image,180)
        .then(function(res) {
          giftCardTemplateUrl = res;
        });
      const businessDetails = await bussinessModel.findOne({
        where: {id: giftCardDetails.business_id},
      });
      if(giftCardDetails) {
        const giftCardObj = {
          gift_card_id: data.gift_card_id,
          gift_card_template_id: data.gift_card_template_id,
          gift_for: data.gift_for,
          from: data.from,
          note: data.note,
          to_email: data.to_email,
          amount: data.amount,
          user_id: userDetails.id,
          business_id: giftCardDetails.business_id,
          purchase_date: currentDate,
          redeemed_amount: data.redeemed_amount,
          payment_id: data.payment_id,
          local_time: data.local_time,
          timezone: data.timezone,
          payment_status: data.payment_status,
          payment_response: data.payment_response && typeof (data.payment_response) != 'string' ? JSON.stringify(data.payment_response) : data.payment_response,
          qty: data.qty,
          giftcard_amount: giftCardDetails.amount,
          stripe_fee: data.stripe_fee ?? null,
          business_revenue: data.business_revenue ?? null,
          admin_revenue: data.admin_revenue ?? null,
        };

        var userCashbackLoyalty = await userModel.findOne({
          where: {
            id: userDetails.id,
            is_deleted: false,
          },
        });

        if(data?.schedule_datetime && data?.schedule_datetime != "" && moment(data.schedule_datetime).isValid()) {
          giftCardObj.schedule_datetime = moment(data.schedule_datetime).format(
            "YYYY-MM-DD HH:mm:ss"
          );
          giftCardObj.is_schedule_sent = false;
          giftCardObj.is_email_sent = false;
        } else {
          giftCardObj.is_email_sent = true;
        }
        if(data.qty && data.qty > 0) {
          const createdSharedGiftCards = [];
          const gCard = await userGiftCardModel.create(giftCardObj);
          //sendGiftCardShareNotificationToBusinessUser(data,userDetails,gCard,giftCardDetails)

          if(giftCardDetails.is_cashback == true) {
            const giftcardcashbackamount = (
              (giftCardDetails.amount * giftCardDetails.cashback_percentage) /
              100
            ).toFixed(2);
            const usercashback = userCashbackLoyalty.total_cashbacks || 0.0;
            const usertotalCashback = parseFloat(usercashback) + parseFloat(giftcardcashbackamount);
            const updateCashback = userCashbackLoyalty.update({
              total_cashbacks: usertotalCashback,
            });

            const cashbackReward = await rewardHistoryModel.create({
              giftcard_id: giftCardDetails.id,
              user_id: userDetails.id,
              user_gift_card_id: gCard.id,
              credit_debit: true,
              amount: giftcardcashbackamount,
              reference_reward_type: 'cashbacks'
            });

            if(cashbackReward) {
              // send to User ON PURCHASE GIFTCARD
              const notificationCashbackUserObj = {
                role_id: 3,
                params: JSON.stringify({
                  notification_type: NOTIFICATION_TYPES.CASHBACK_REWARD,
                  title: NOTIFICATION_TITLES.CASHBACK_REWARD(),
                  message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(giftCardDetails.name,`${giftCardDetails.cashback_percentage}%`,'virtual card'),
                  giftcard_id: giftCardDetails?.id,
                  business_id: giftCardDetails.business_id
                }),
                title: NOTIFICATION_TITLES.CASHBACK_REWARD(),
                message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(giftCardDetails.name,`${giftCardDetails.cashback_percentage}%`,'virtual card'),
                notification_type: NOTIFICATION_TYPES.CASHBACK_REWARD,
              }
              const notificationCashbackUser = await notificationModel.create(notificationCashbackUserObj);
              if(notificationCashbackUser && notificationCashbackUser.id) {
                const notificationReceiverCashbackObj = {
                  role_id: user.role_id,
                  notification_id: notificationCashbackUser.id,
                  sender_id: giftCardDetails.business_id,
                  receiver_id: user.id,
                  is_read: false
                }
                const notificationCashbackReceiver = await notificationReceiverModel.create(notificationReceiverCashbackObj);
                /** FCM push noifiation */
                const activeUserReceiverDevices = await deviceModel.findOne({where: {status: 1,user_id: user.id}},{attributes: ["device_token"]});
                const userLoyaltyNotificationPayload = {
                  device_token: activeUserReceiverDevices?.device_token,
                  title: NOTIFICATION_TITLES.CASHBACK_REWARD(),
                  message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(giftCardDetails.name,`${giftCardDetails.cashback_percentage}%`,'virtual card'),
                  content: {notification_type: NOTIFICATION_TYPES.CASHBACK_REWARD,notification_id: notificationCashbackUser?.id,title: NOTIFICATION_TITLES.CASHBACK_REWARD(),message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(giftCardDetails.name,`${giftCardDetails.cashback_percentage}%`,'virtual card'),giftcard_id: giftCardDetails?.id,business_id: giftCardDetails.business_id}
                };
                await fcmNotification.SendNotification(userLoyaltyNotificationPayload);
              }
            }
          }

          // GIFTCARD LOYALTY POINTS
          const loyaltyPointModel = models.loyalty_points;
          // Loyalty On Order
          const loyalty = await loyaltyPointModel.findOne({
            attributes: {
              exclude: ["createdAt","updatedAt","deleted_at","isDeleted"],
            },
            where: {
              //gift_card_id: {
              //  [Op.regexp]: `(^|,)${giftCardDetails.id}(,|$)`,
              //},
              status: true,
              loyalty_type: false,
              business_id: giftCardDetails.business_id,
              points_redeemed: true,
              isDeleted: false,
              amount: {
                [Op.lte]: data.amount
              },
              validity: {
                [Op.gte]: currentDate,
              },
            },
            order: [
              ["amount","DESC"]
            ],
          });

          if(loyalty != null) {
            console.log('loyalty')

            if(loyalty.points_redeemed == true && loyalty) {
              const giftcardloyaltyamount = loyalty.points_earned || 0.0;
              const userloyalty =
                userCashbackLoyalty.total_loyalty_points || 0.0;
              const usertotalLoyalty =
                parseFloat(userloyalty) + parseFloat(giftcardloyaltyamount);
              const updateCashback = userCashbackLoyalty.update({
                total_loyalty_points: usertotalLoyalty,
              });
            }

            const loayaltyReward = await rewardHistoryModel.create({
              giftcard_id: giftCardDetails.id,
              user_id: userDetails.id,
              user_gift_card_id: gCard.id,
              credit_debit: true,
              amount: loyalty.points_earned,
              reference_reward_id: loyalty.id,
              reference_reward_type: 'loyalty_points'
            });

            if(loayaltyReward) {
              // send to User ON PURCHASE GIFTCARD
              const notificationLoyaltyUserObj = {
                role_id: 3,
                params: JSON.stringify({
                  notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
                  title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                  message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyalty.points_earned,'giftcard',giftCardDetails.name),
                  loyalty_id: loyalty?.id,
                  business_id: giftCardDetails.business_id
                }),
                title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyalty.points_earned,'giftcard',giftCardDetails.name),
                notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
              }
              const notificationLoyaltyUser = await notificationModel.create(notificationLoyaltyUserObj);
              if(notificationLoyaltyUser && notificationLoyaltyUser.id) {
                const notificationReceiverLoyaltyObj = {
                  role_id: user.role_id,
                  notification_id: notificationLoyaltyUser.id,
                  sender_id: giftCardDetails.business_id,
                  receiver_id: user.id,
                  is_read: false
                }
                const notificationLoyaltyReceiver = await notificationReceiverModel.create(notificationReceiverLoyaltyObj);
                /** FCM push noifiation */
                const activeUserReceiverDevices = await deviceModel.findOne({where: {status: 1,user_id: user.id}},{attributes: ["device_token"]});
                const userLoyaltyNotificationPayload = {
                  device_token: activeUserReceiverDevices?.device_token,
                  title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                  message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyalty.points_earned,'giftcard',giftCardDetails.name),
                  content: {
                    notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
                    notification_id: notificationLoyaltyUser?.id,
                    title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                    message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyalty.points_earned,'giftcard',giftCardDetails.name),
                    giftcard_id: giftCardDetails?.id,
                    business_id: giftCardDetails.business_id
                  }
                };
                await fcmNotification.SendNotification(userLoyaltyNotificationPayload);
              }
            }
          }

          // LOyalty on Product 
          const loyaltyOnProduct = await loyaltyPointModel.findOne({
            attributes: {
              exclude: ["createdAt","updatedAt","deleted_at","isDeleted"],
            },
            where: {
              gift_card_id: {
                [Op.regexp]: `(^|,)${giftCardDetails.id}(,|$)`,
              },
              status: true,
              loyalty_type: true,
              business_id: giftCardDetails.business_id,
              points_redeemed: true,
              isDeleted: false,
              //amount: {
              //  [Op.gte]: data.amount
              //}
              validity: {
                [Op.gte]: currentDate,
              },
            },
            order: [
              ["amount","DESC"]
            ],
          });
          if(loyaltyOnProduct != null) {
            console.log('loyaltyOnProduct')
            if(loyaltyOnProduct.points_redeemed == true && loyaltyOnProduct) {
              const giftcardloyaltyamount = loyaltyOnProduct.points_earned || 0.0;
              const userloyalty =
                userCashbackLoyalty.total_loyalty_points || 0.0;
              const usertotalLoyalty =
                parseFloat(userloyalty) + parseFloat(giftcardloyaltyamount);
              const updateCashback = userCashbackLoyalty.update({
                total_loyalty_points: usertotalLoyalty,
              });
            }

            const loayaltyReward = await rewardHistoryModel.create({
              giftcard_id: giftCardDetails.id,
              user_id: userDetails.id,
              user_gift_card_id: gCard.id,
              credit_debit: true,
              amount: loyaltyOnProduct.points_earned,
              reference_reward_id: loyaltyOnProduct.id,
              reference_reward_type: 'loyalty_points'
            });

            if(loayaltyReward) {
              // send to User ON PURCHASE GIFTCARD
              const notificationLoyaltyUserObj = {
                role_id: 3,
                params: JSON.stringify({
                  notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
                  title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                  message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyaltyOnProduct.points_earned,'virtual card',giftCardDetails.name),
                  loyalty_id: loyalty?.id,
                  business_id: giftCardDetails.business_id
                }),
                title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyaltyOnProduct.points_earned,'virtual card',giftCardDetails.name),
                notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
              }
              const notificationLoyaltyUser = await notificationModel.create(notificationLoyaltyUserObj);
              if(notificationLoyaltyUser) {
                const notificationReceiverLoyaltyObj = {
                  role_id: 2,
                  notification_id: notificationLoyaltyUser.id,
                  sender_id: giftCardDetails.business_id,
                  receiver_id: user.id,
                  is_read: false
                }
                const notificationLoyaltyReceiver = await notificationReceiverModel.create(notificationReceiverLoyaltyObj);
                /** FCM push noifiation */
                const activeUserReceiverDevices = await deviceModel.findOne({where: {status: 1,user_id: user.id}},{attributes: ["device_token"]});
                // const userDeviceTokensList = activeUserReceiverDevices.map((device) => device.device_token);
                // const userUniqueDeviceTokens = Array.from(new Set(userDeviceTokensList))
                const userLoyaltyNotificationPayload = {
                  device_token: activeUserReceiverDevices?.device_token,
                  title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                  message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyaltyOnProduct.points_earned,'virtual card',giftCardDetails.name),
                  content: {
                    notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
                    notification_id: notificationLoyaltyUser?.id,
                    title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER('virtual card'),
                    message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER_ON_GIFTCARD(loyaltyOnProduct.points_earned,'virtual card',giftCardDetails.name),
                    giftcard_id: giftCardDetails?.id,
                    business_id: giftCardDetails.business_id
                  }
                };
                await fcmNotification.SendNotification(userLoyaltyNotificationPayload);
              }
            }
          }

          const createRewardHistory = await rewardHistoryModel.create({
            amount: data.amount,
            giftcard_id: gCard.gift_card_id,
            user_id: user.id,
            user_gift_card_id: gCard.id,
            reference_reward_id: gCard.gift_card_id,
            reference_reward_type: "gift_cards",
          });

          createdSharedGiftCards.push(gCard);
          const transporter = nodemailer.createTransport({
            host: mailConfig.host,
            port: mailConfig.port,
            secure: mailConfig.secure,
            auth: mailConfig.auth,
            tls: mailConfig.tls,
          });

          const templates = new EmailTemplates({
            juice: {
              webResources: {
                images: false,
              },
            },
          });

          // If Sharing Giftcard to Self
          const expireDate = moment(giftCardDetails.expire_at).format(
            "MM-DD-YYYY"
          );

          /** Send Push Notification */
          // For share self to purchase
          if(userDetails.email == data.to_email) {
            const context = {
              userName: userDetails.username,
              giftCardName: giftCardDetails.name,
              giftCardAmount: giftCardDetails.amount,
              giftCardUrl: `${giftCardImage}`,
              expireDate: expireDate,
              note: data.note,
              giftCardQty: data?.qty || 1,
            };

            templates.render(
              path.join(
                __dirname,
                "../../",
                "template",
                "gift-card-purchased.html"
              ),
              context,
              (err,html,text,subject) => {
                transporter.sendMail(
                  {
                    from: "b.a.s.e. <do-not-reply@mail.com>",
                    to: userDetails.email,
                    subject: `B.a.s.e Virtual card`,
                    html: html,
                  },
                  function(err,result) {
                    if(err) {
                      console.log("mail error",err);
                    }
                  }
                );
              }
            );
          }
          if(userDetails.email != data.to_email && !data?.schedule_datetime) {
            const toUser = await userModel.findOne({
              where: {
                email: data.to_email,
                is_active: true,
                is_deleted: false,
              },
            });
            const ToUsename = toUser ? toUser?.username : "";
            const context = {
              userName: ToUsename,
              giftCardName: giftCardDetails.name,
              giftCardAmount: giftCardDetails.amount,
              giftCardUrl: `${giftCardImage}`,
              giftCardTemplateUrl: `${giftCardTemplateUrl}`,
              expireDate: expireDate,
              giftCardQty: data.qty || 1,
              note: data.note,
            };
            templates.render(
              path.join(
                __dirname,
                "../../",
                "template",
                "gift-card-shared.html"
              ),
              context,
              (err,html,text,subject) => {
                transporter.sendMail(
                  {
                    from: "b.a.s.e. <do-not-reply@mail.com>",
                    to: data.to_email,
                    subject: `${userDetails.username} Sent you  B.a.s.e Virtual card !`,
                    html: html,
                  },
                  function(err,result) {
                    if(err) {
                      console.log("mail error",err);
                    }
                  }
                );
              }
            );
          }
          /** Send Push Notification */
          // For share self to purchase to BUSINESS
          //if(userDetails.email == data.to_email) {
          const notificationObj = {
            params: JSON.stringify({
              notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
              title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(userDetails?.username),
              message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(userDetails?.username,giftCardDetails?.name),
              giftcard_id: data.gift_card_id,
              user_id: user.id,
              business_id: giftCardDetails.business_id,
            }),
            title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(userDetails?.username),
            message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(userDetails?.username,giftCardDetails?.name),
            notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
          };
          const notification = await notificationModel.create(notificationObj);
          if(notification && notification.id) {
            const notificationReceiverObj = {
              role_id: 3,
              notification_id: notification.id,
              receiver_id: giftCardDetails.business_id,
              is_read: false
            };
            const notificationReceiver =
              await notificationReceiverModel.create(notificationReceiverObj);
          }
          /** FCM push noifiation */
          const activeReceiverDevices = await deviceModel.findAll(
            {
              where: {status: 1,business_id: giftCardDetails.business_id},
            },
            {attributes: ["device_token"]}
          );
          const deviceTokensList = activeReceiverDevices.map(
            (device) => device.device_token
          );
          const uniqueDeviceTokens = Array.from(new Set(deviceTokensList));
          const notificationPayload = {
            device_token: uniqueDeviceTokens,
            title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(userDetails?.username),
            message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(userDetails?.username,giftCardDetails?.name),
            content: {
              notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
              notification_id: notification.id,
              title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(userDetails?.username),
              message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(userDetails?.username,giftCardDetails?.name),
              giftcard_id: data.gift_card_id,
              user_id: user.id,
              business_id: giftCardDetails.business_id,
            },
          };
          await fcmNotification.SendNotification(notificationPayload);
          //}

          // For share to Existing user
          if(userDetails.email != data.to_email && !data?.schedule_datetime) {
            const toEmailUserExists = await userModel.findOne({
              where: {
                email: data.to_email,
                is_active: true,
                is_deleted: false,
              },
            });
            if(toEmailUserExists) {
              //if(giftCardDetails.is_cashback == true) {
              //  const giftcardcashbackamount = (
              //    (giftCardDetails.amount *
              //      giftCardDetails.cashback_percentage) /
              //    100
              //  ).toFixed(2);
              //  const usercashback = toEmailUserExists.total_cashbacks || 0.0;
              //  const usertotalCashback =
              //    parseFloat(usercashback) + parseFloat(giftcardcashbackamount);

              //  const updateCashback = toEmailUserExists.update({
              //    total_cashbacks: usertotalCashback,
              //  });
              //}

              //const loyaltyPointModel = models.loyalty_points;
              //const loyalty = await loyaltyPointModel.findOne({
              //  attributes: {
              //    exclude: [
              //      "createdAt",
              //      "updatedAt",
              //      "deleted_at",
              //      "isDeleted",
              //    ],
              //  },
              //  where: {
              //    gift_card_id: {
              //      [Op.regexp]: `(^|,)${giftCardDetails.id}(,|$)`,
              //    },
              //    status: true,
              //    isDeleted: false,
              //  },
              //});
              //if(loyalty != null) {
              //  if(loyalty.points_redeemed == true && loyalty) {
              //    const giftcardloyaltyamount = loyalty.points_earned || 0.0;
              //    const userloyalty =
              //      toEmailUserExists.total_loyalty_points || 0.0;
              //    const usertotalLoyalty =
              //      parseFloat(userloyalty) + parseFloat(giftcardloyaltyamount);
              //    const updateCashback = toEmailUserExists.update({
              //      total_loyalty_points: usertotalLoyalty,
              //    });
              //  }
              //}
              const notificationObj = {
                role_id: user.role_id,
                params: JSON.stringify({
                  notification_type: NOTIFICATION_TYPES.GIFT_CARD_SHARE,
                  title: NOTIFICATION_TITLES.GIFT_CARD_SHARE(userDetails.username),
                  message: NOTIFICATION_MESSAGE.GIFT_CARD_SHARE(giftCardDetails?.name),
                  giftcard_id: gCard.id,
                  user_id: user.id,
                  business_id: giftCardDetails.business_id,
                }),
                title: NOTIFICATION_TITLES.GIFT_CARD_SHARE(toEmailUserExists.username),
                message: NOTIFICATION_MESSAGE.GIFT_CARD_SHARE(giftCardDetails?.name),
                notification_type: NOTIFICATION_TYPES.GIFT_CARD_SHARE,
              };
              const notification = await notificationModel.create(notificationObj);
              if(notification && notification.id) {
                const notificationReceiverObj = {
                  role_id: toEmailUserExists.role_id,
                  notification_id: notification.id,
                  sender_id: user.id,
                  receiver_id: toEmailUserExists.id,
                  is_read: false
                };
                const notificationReceiver =
                  await notificationReceiverModel.create(notificationReceiverObj);
              }
              /** FCM push noifiation */
              const activeReceiverDevices = await deviceModel.findAll(
                {where: {status: 1,user_id: toEmailUserExists.id}},
                {attributes: ["device_token"]}
              );
              const deviceTokensList = activeReceiverDevices.map(
                (device) => device.device_token
              );
              const uniqueDeviceTokens = Array.from(new Set(deviceTokensList));
              const notificationPayload = {
                device_token: uniqueDeviceTokens,
                title: NOTIFICATION_TITLES.GIFT_CARD_SHARE(userDetails.username),
                message: NOTIFICATION_MESSAGE.GIFT_CARD_SHARE(giftCardDetails?.name),
                content: {
                  notification_type: NOTIFICATION_TYPES.GIFT_CARD_SHARE,
                  notification_id: notification.id,
                  title: NOTIFICATION_TITLES.GIFT_CARD_SHARE(userDetails.username),
                  message: NOTIFICATION_MESSAGE.GIFT_CARD_SHARE(giftCardDetails?.name),
                  giftcard_id: gCard.id,
                  user_id: toEmailUserExists.id,
                  business_id: giftCardDetails.business_id,
                },
              };
              await fcmNotification.SendNotification(notificationPayload);
            }

          }

          if(data?.use_redeem_points) {
            //if(parseInt(userWalletAmounts.total_loyalty_points) < parseInt(data?.use_redeem_points?.amount)) {
            //  throw new Error('Insufficient amount of cashback for loyalty points request');
            //} else {
            //Redeem loyalty points from user and create debit transaction
            if(data?.use_redeem_points?.amount && data?.use_redeem_points?.amount > 0 && data?.use_redeem_points?.is_used) {
              const rewardLoyaltyPointsDebit = await rewardHistoryModel.create({
                giftcard_id: data.gift_card_id,
                user_id: user.id,
                user_gift_card_id: gCard.id,
                credit_debit: false,
                amount: data?.use_redeem_points?.amount,
                reference_reward_type: 'loyalty_points'
              });
              const userWalletAmounts = await userModel.findOne({where: {id: user.id},attributes: ["total_loyalty_points","total_cashbacks"]});

              const userCashbackUpdate = await userModel.update({
                total_loyalty_points: models.sequelize.literal(`total_loyalty_points - ${data?.use_redeem_points?.amount}`)
              },
                {
                  where: {
                    id: user.id
                  }
                });
            }
            //}
          }

          if(data?.use_cashback) {
            //const userWalletAmounts = await userModel.findOne({where: {id: user.id},attributes: ["total_loyalty_points","total_cashbacks"]});
            //if(parseInt(userWalletAmounts.total_cashbacks) > parseInt(data?.use_cashback?.amount)) {
            //  return res.send(
            //    setRes(
            //      resCode.BadRequest,
            //      false,
            //      "Insufficient amount of cashback for user request.",
            //      null
            //    )
            //  );
            //  //throw new Error('Insufficient amount of cashback for user request');
            //} else {
            // Redeem cashback amount from user and create debit transaction
            if(data?.use_cashback?.amount && data?.use_cashback?.amount > 0 && data?.use_cashback?.is_used) {
              const rewardCashbackDebit = await rewardHistoryModel.create({
                giftcard_id: data.gift_card_id,
                user_id: user.id,
                user_gift_card_id: gCard.id,
                credit_debit: false,
                amount: data?.use_cashback?.amount,
                reference_reward_type: 'cashbacks'
              });

              const userCashbackUpdate = await userModel.update({
                total_cashbacks: models.sequelize.literal(`total_cashbacks - ${data?.use_cashback?.amount}`)
              },
                {
                  where: {
                    id: user.id
                  }
                });
            }
            //}
          }
          /** END Send Push Notification */
          // }
          res.send(
            setRes(
              resCode.OK,
              true,
              "Virtual Card Shared successfully!",
              createdSharedGiftCards
            )
          );
        } else {
          return res.send(
            setRes(resCode.BadRequest,false,"Invalid value for Qty.",null)
          );
        }
      } else {
        return res.send(
          setRes(
            resCode.ResourceNotFound,
            false,
            "Virtual card not found.",
            null
          )
        );
      }
    } else {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          requiredFields.toString() + " are required",
          null
        )
      );
    }
  } catch(error) {
    console.log(error)
    return res.send(
      setRes(resCode.BadRequest,false,"Something went wrong!",null)
    );
  }
};
// Purchase gift card  END

// User giftcards list
exports.userGiftCardList = async (req,res) => {
  try {
    const data = req.body;
    const user = req?.user;
    // const userEmail = req.userEmail;
    const userEmail = user?.user;
    const userModel = models.user;
    const giftCardsModel = models.gift_cards;
    const userGiftCardsModel = models.user_giftcards;
    const Op = models.Op;
    const currentDate = moment().format("YYYY-MM-DD");
    let requiredFields = _.reject(["page","page_size"],(o) => {
      return _.has(data,o);
    });

    const userDetails = await userModel.findOne({
      where: {email: userEmail,is_active: true,is_deleted: false},
    });
    if(!userDetails) {
      return res.send(
        setRes(resCode.ResourceNotFound,false,"User not found",null)
      );
    }
    if(requiredFields == "") {
      if(data.page < 0 || data.page === 0) {
        return res.send(
          setRes(
            resCode.BadRequest,
            false,
            "invalid page number, should start with 1",
            null
          )
        );
      }
      const skip = data.page_size * (data.page - 1);
      const limit = parseInt(data.page_size);



      const condition = {
        offset: skip,
        limit: limit,
        include: [
          {
            model: giftCardsModel,
            attributes: {
              exclude: [
                "status",
                "isDeleted",
                "createdAt",
                "updatedAt",
                "deleted_at",
              ],
            },

            where: {
              expire_at: {
                [Op.gte]: currentDate,
              },
            },
          },
        ],
        attributes: {
          exclude: ["status","isDeleted","createdAt","updatedAt"],
          include: [
            [
              models.sequelize.literal(
                "(user_giftcards.amount - user_giftcards.redeemed_amount)"
              ),
              "remaining_amount",
            ],
          ],
        },
        order: [["createdAt","DESC"]],
      };
      const businessCond = data.business_id
        ? {business_id: data.business_id}
        : {};
      condition.where = {
        status: true,
        is_deleted: false,
        is_schedule_sent: true,
        ...businessCond,
        [Op.or]: [
          {
            [Op.and]: [
              {
                to_email: null,
              },
              {
                user_id: userDetails.id,
              },
            ],
          },
          {
            to_email: userEmail,
          },
        ],
      };
      const userGiftCards = await userGiftCardsModel.findAndCountAll(condition);
      for(const data of userGiftCards?.rows) {
        let rewardHistoryModel = models.reward_history;
        let orderModel = models.orders;
        var rewardHistory = await rewardHistoryModel.findOne({
          where: {
            user_id: userDetails.id,
            giftcard_id: data.gift_card_id,
            user_gift_card_id: data.id,
            reference_reward_type: 'gift_cards',
            reference_reward_id: data.gift_card_id,
            credit_debit: false,
          },
          include: [
            {
              model: orderModel,
              where: {
                user_id: userDetails.id,
              },
              required: true
            },{
              model: models.user,
            }

          ]
        });
        var is_used = false;
        if(!_.isNull(rewardHistory)) {
          is_used = true;
        }
        delete data.dataValues.amount;
        data.dataValues.remaining_amount = data?.gift_card?.amount;
        data.dataValues.is_used = is_used;
        data.dataValues.amount = data?.gift_card?.amount;
      }
      userGiftCards?.rows.sort((a,b) => new moment(b.createdAt) - new moment(a.createdAt));
      //userGiftCards?.rows.sort((a,b) => (a.is_used == false) ? 1 : -1);

      const totalRecords = userGiftCards?.count || 0;
      const response = new pagination(
        userGiftCards?.rows,
        totalRecords,
        parseInt(data.page),
        parseInt(data.page_size)
      );
      res.send(
        setRes(
          resCode.OK,
          true,
          "User Virtual cards List.",
          response.getPaginationInfo()
        )
      );
    } else {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          requiredFields.toString() + " are required",
          null
        )
      );
    }
  } catch(error) {
    return res.send(
      setRes(resCode.BadRequest,false,"Something went wrong!",null)
    );
  }
};

exports.userGiftCardDetailsnew = async (req,res) => {
  try {
    const data = req.params;
    const userPurchasedgiftCardId = data.id;
    const user = req.user;

    const giftCardModel = models.gift_cards;
    const userGiftCardModel = models.user_giftcards;
    const loyaltyPointModel = models.loyalty_points;
    const Op = models.Op;

    var giftCardDetails = await giftCardModel.findOne({
      attributes: {
        include: [[models.sequelize.literal("'gift_cards'"),"type"]],
      },
      where: {
        id: userPurchasedgiftCardId,
        isDeleted: false,
        status: true
      },
      include: [{
        model: userGiftCardModel,
      }]
    })

    //const userGiftCard = await userGiftCardModel.findOne({
    //  where: {
    //    id: userPurchasedgiftCardId,
    //  },
    //  include: [
    //    {
    //      model: giftCardModel,
    //      attributes: {
    //        include: [[models.sequelize.literal("'gift_cards'"),"type"]],
    //      },
    //      where: {
    //        isDeleted: false,
    //        status: true
    //      }
    //    },
    //  ],
    //});
    //if(!userGiftCard) {
    //  return res.send(
    //    setRes(resCode.ResourceNotFound,false,"User giftcard not found",null)
    //  );
    //}
    //const giftCardDetail = userGiftCard.gift_card;
    const totalPurchasedGiftcard = await userGiftCardModel.findAll({
      where: {
        gift_card_id: giftCardDetails?.id,
        payment_status: 2,
        is_deleted: false,
      },
    });
    if(giftCardDetails.payment_status === 2) {
      const purchase_for = giftCardDetails?.to_email
        ? user?.user == giftCardDetails?.to_email
          ? "Self"
          : giftCardDetails?.to_email
        : "Self";
      giftCardDetails.dataValues.purchase_for = purchase_for;
      giftCardDetails.dataValues.purchase_date =
        userGiftCard?.purchase_date || "";
      giftCardDetails.dataValues.redeemed_amount =
        userGiftCard?.redeemed_amount || "";
      if(userGiftCard?.from) {
        giftCardDetails.dataValues.from = userGiftCard?.from || "";
        giftCardDetails.dataValues.note = userGiftCard?.note || "";
      }
    }

    let giftcardLoyalty = await loyaltyPointModel.findOne({
      where: {
        gift_card_id: {
          [Op.regexp]: `(^|,)${giftCardDetails.id}(,|$)`,
        },
        points_redeemed: true,
      },
    });
    giftCardDetails.dataValues.points_earned = giftcardLoyalty?.points_earned || '0.00';
    giftCardDetails.dataValues.points_redeemed = giftcardLoyalty?.amount || '0.00';

    giftCardDetails.dataValues.totalPurchase =
      totalPurchasedGiftcard?.length || 0;

    return res.send(
      setRes(resCode.OK,true,"User Virtual card details!",giftCardDetails)
    );
  } catch(error) {
    return res.send(
      setRes(resCode.BadRequest,false,"Something went wrong!",null)
    );
  }
};

// Gift Card Redeem
exports.redeemGiftCard = async (req,res) => {
  try {
    const giftCardsModel = models.gift_cards;
    const userGiftCardsModel = models.user_giftcards;
    const data = req.body;
    const user = req.user;
    const requiredFields = _.reject(
      ["user_gift_card_id","redeem_amount"],
      (o) => {
        return _.has(data,o);
      }
    );

    if(requiredFields == "") {
      const giftCardDetails = await userGiftCardsModel.findOne({
        include: [
          {
            model: giftCardsModel,
            attributes: ["id","amount","name","expire_at","description"],
          },
        ],
        where: {
          id: data.user_gift_card_id,
          user_id: user?.id || "",
        },
      });
      // Check for user gift card exist for user
      if(!giftCardDetails) {
        return res.send(
          setRes(resCode.BadRequest,false,"User Giftcard not found.",null)
        );
      }

      // Check for gift card expiration
      const expireAt = giftCardDetails?.dataValues?.gift_card.expire_at;
      const currentDate = moment().format("YYYY-MM-DD");
      if(currentDate > expireAt) {
        return res.send(
          setRes(resCode.BadRequest,false,"Virtaulcard is expired",null)
        );
      }

      // Check for redeem amount request to eligible to deduct from remaining
      const giftCardAmount = Number(giftCardDetails?.dataValues?.amount || 0);
      let giftCardRedeemedAmount = Number(
        giftCardDetails?.dataValues?.redeemed_amount || 0
      );
      const giftCardRemainingAmount = giftCardAmount - giftCardRedeemedAmount;
      if(data.redeem_amount > giftCardRemainingAmount) {
        return res.send(
          setRes(
            resCode.BadRequest,
            false,
            "Redeem amount is more than remaining balance for virtualcard",
            null
          )
        );
      }

      giftCardRedeemedAmount += Number(data.redeem_amount || 0);

      const redeemeUpdatedRecord = await userGiftCardsModel.update(
        {
          redeemed_amount: giftCardRedeemedAmount,
        },
        {
          where: {
            id: data.user_gift_card_id,
          },
        }
      );
      if(redeemeUpdatedRecord) {
        const updatedUserGiftCard = await userGiftCardsModel.findOne({
          include: [
            {
              model: giftCardsModel,
              attributes: {
                exclude: [
                  "status",
                  "isDeleted",
                  "createdAt",
                  "updatedAt",
                  "deleted_at",
                  "amount",
                ],
              },
            },
          ],
          attributes: {
            exclude: ["status","isDeleted","createdAt","updatedAt"],
            include: [
              [
                models.sequelize.literal(
                  "(user_giftcards.amount - user_giftcards.redeemed_amount)"
                ),
                "remaining_amount",
              ],
            ],
          },
          where: {
            id: data.user_gift_card_id,
          },
        });
        return res.send(
          setRes(
            resCode.OK,
            true,
            "Virtual card Amount Redeemed Successfully!",
            updatedUserGiftCard
          )
        );
      } else {
        return res.send(
          setRes(
            resCode.BadRequest,
            false,
            "Virtual card Amount Redeem failed",
            null
          )
        );
      }
    } else {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          requiredFields.toString() + " are required",
          null
        )
      );
    }
  } catch(error) {
    return res.send(
      setRes(resCode.BadRequest,false,"Something went wrong!",null)
    );
  }
};

exports.recommendedGiftCard = async (req,res) => {
  try {
    const giftCardsModel = models.gift_cards;
    const Op = models.Op;
    const data = req.body;
    const user = req.user;
    const currentDate = moment().format("YYYY-MM-DD");
    const requiredFields = _.reject(
      ["page","page_size","giftcard_id"],
      (o) => {
        return _.has(data,o);
      }
    );

    if(data.page < 0 || data.page === 0) {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          "invalid page number, should start with 1",
          null
        )
      );
    }

    const skip = data.page_size * (data.page - 1);
    const limit = parseInt(data.page_size);

    if(requiredFields == "") {
      const giftCardExists = await giftCardsModel.findOne({
        where: {
          id: data.giftcard_id,
        },
      });
      if(!giftCardExists) {
        return res.send(
          setRes(
            resCode.BadRequest,
            false,
            "User Virtual card not found.",
            null
          )
        );
      }

      const giftCards = await giftCardsModel.findAndCountAll({
        offset: skip,
        limit: limit,
        where: {
          id: {
            [Op.ne]: data.giftcard_id,
          },
          business_id: giftCardExists.business_id,
          status: true,
          isDeleted: false,
          expire_at: {
            [Op.gte]: currentDate,
          },
        },
        order: [["createdAt","DESC"]],
      });

      const totalRecords = +giftCards.count || 0;

      for(let giftCardObj of giftCards.rows) {
        if(giftCardObj.image != null) {
          var profile_picture = await awsConfig
            .getSignUrl(giftCardObj.image)
            .then(function(res) {
              giftCardObj.dataValues.image = res;
            });
        }
      }

      const response = new pagination(
        giftCards.rows,
        +totalRecords,
        parseInt(data.page),
        parseInt(data.page_size)
      );

      return res.send(
        setRes(
          resCode.OK,
          true,
          "Virtual cards reccomended list.",
          response.getPaginationInfo()
        )
      );
    } else {
      return res.send(
        setRes(
          resCode.BadRequest,
          false,
          requiredFields.toString() + " are required",
          null
        )
      );
    }
  } catch(error) {
    return res.send(
      setRes(resCode.BadRequest,false,"Something went wrong!",null)
    );
  }
};

exports.priceFilterForWallet = async (req,res) => {
  try {
    const data = req.query;
    const promises = [];
    var request_type = data.type;
    const giftCardModel = models.gift_cards;
    const cashbackModel = models.cashbacks;
    const discountModel = models.discounts;
    const couponeModel = models.coupones;
    const loyaltyPointModel = models.loyalty_points;
    const Op = models.Op;
    const currentDate = moment().format("YYYY-MM-DD");
    const requiredFields = _.reject([],(o) => {
      return _.has(data,o);
    });
    if(requiredFields == "") {
      var typeArr = [
        "gift_cards",
        "cashbacks",
        "discounts",
        "coupones",
        "loyalty_points",
      ];

      let reqTypeArr =
        request_type.includes(",") && request_type.split(",").length > 0
          ? request_type.split(",")
          : request_type && request_type.trim() !== ""
            ? [request_type]
            : typeArr;
      reqTypeArr = reqTypeArr.filter((tp) => tp && tp.trim() !== "");
      const requestTypeNotExists = reqTypeArr.filter(
        (tp) => !typeArr.includes(tp) && tp !== ""
      );
      if(reqTypeArr && requestTypeNotExists.length !== 0) {
        return res.send(
          setRes(resCode.BadRequest,false,"Please select valid type.",null)
        );
      }
      promises.push(
        await giftCardModel
          .findAll({
            where: {isDeleted: false,status: true,deleted_at: null},
            attributes: {
              include: [
                "id",
                "amount",
                [models.sequelize.literal("'gift_cards'"),"type"],
              ],
            },
          })
          .then(async (giftCardData) => {
            if(giftCardData) {
              const dataArray = [];
              // Update Sign URL
              for(const data of giftCardData) {
                let result = JSON.parse(JSON.stringify(data));
                dataArray.push(result);
              }
              return dataArray;
            }
            return [];
          }),
        await cashbackModel
          .findAll({
            where: {isDeleted: false,status: true,deleted_at: null},
            attributes: {
              include: [
                "id",
                "cashback_type",
                "cashback_value",
                [models.sequelize.literal("'cashbacks'"),"type"],
              ],
            },
          })
          .then(async (CashbackData) => {
            if(CashbackData) {
              const dataArray = [];
              for(const data of CashbackData) {
                let result = JSON.parse(JSON.stringify(data));
                result.amount = data.cashback_value;
                dataArray.push(result);
              }
              return dataArray;
            }
            return [];
          }),
        await discountModel
          .findAll({
            where: {isDeleted: false,status: true,deleted_at: null},
            attributes: {
              include: [
                "id",
                "discount_type",
                "discount_value",
                [models.sequelize.literal("'discounts'"),"type"],
              ],
            },
          })
          .then(async (DiscountData) => {
            if(DiscountData) {
              const dataArray = [];
              for(const data of DiscountData) {
                let result = JSON.parse(JSON.stringify(data));
                result.amount = data.discount_value;
                dataArray.push(result);
              }
              return dataArray;
            }
            return [];
          }),
        await couponeModel
          .findAll({
            where: {isDeleted: false,status: true,deleted_at: null},
            attributes: {
              include: [
                "id",
                "value_type",
                "coupon_value",
                [models.sequelize.literal("'coupones'"),"type"],
              ],
            },
          })
          .then(async (CouponeData) => {
            if(CouponeData) {
              const dataArray = [];
              for(const data of CouponeData) {
                let result = JSON.parse(JSON.stringify(data));
                result.amount = data.coupon_value;
                dataArray.push(result);
              }
              return dataArray;
            }
            return [];
          }),
        await loyaltyPointModel
          .findAll({
            where: {isDeleted: false,status: true,deleted_at: null},
            attributes: {
              include: [
                "id",
                "amount",
                [models.sequelize.literal("'loyalty_points'"),"type"],
              ],
            },
          })
          .then(async (LoyaltyPointData) => {
            if(LoyaltyPointData) {
              const dataArray = [];
              for(const data of LoyaltyPointData) {
                let result = JSON.parse(JSON.stringify(data));
                dataArray.push(result);
              }
              return dataArray;
            }
            return [];
          })
      );

      const [
        giftcardRewards,
        cashbackData,
        discountData,
        couponeData,
        loyaltyPointData,
      ] = await Promise.all(promises);

      const arrays = [
        giftcardRewards,
        cashbackData,
        discountData,
        couponeData,
        loyaltyPointData,
      ];
      const mergedArray = mergeRandomArrayObjects(arrays);
      let result = mergedArray;

      if(!_.isEmpty(request_type)) {
        result = _.filter(result,(reward) => reqTypeArr.includes(reward.type));
        //result = _.filter(result, {type: request_type})
      }
      var filters = [];
      const attrToExtract = "amount";
      const extractedData = _.map(result,(obj) =>
        Math.round(obj[attrToExtract])
      );

      if(!_.isEmpty(extractedData)) {
        var minValue = null;
        if(extractedData.length == 1) {
          minValue = 10;
        } else {
          if(Math.min(...extractedData) <= 5) {
            minValue = 10;
          } else {
            minValue = Math.min(...extractedData);
          }
        }
        const maxValue = Math.max(...extractedData);
        filters = generateFilters(minValue,maxValue,2);
      }

      res.send(
        setRes(resCode.OK,true,"Get rewards list successfully",filters)
      );
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
  } catch(error) {
    console.log(error)
    res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
};

exports.userGiftCardDetails = async (req,res) => {
  try {
    const data = req.params;
    const userPurchasedgiftCardId = data.id;
    const user = req.user;

    const giftCardModel = models.gift_cards;
    const userGiftCardModel = models.user_giftcards;
    const loyaltyPointModel = models.loyalty_points;
    const Op = models.Op;

    const userGiftCard = await userGiftCardModel.findOne({
      where: {
        id: userPurchasedgiftCardId,
      },
      include: [
        {
          model: giftCardModel,
          attributes: {
            include: [[models.sequelize.literal("'gift_cards'"),"type"]],
          },
          where: {
            isDeleted: false,
            status: true
          }
        },
      ],
    });
    if(!userGiftCard) {
      return res.send(
        setRes(resCode.ResourceNotFound,false,"User giftcard not found",null)
      );
    }
    const giftCardDetail = userGiftCard.gift_card;
    const totalPurchasedGiftcard = await userGiftCardModel.findAll({
      where: {
        gift_card_id: giftCardDetail?.id,
        payment_status: 2,
        is_deleted: false,
      },
    });
    if(userGiftCard.payment_status === 2) {
      const purchase_for = userGiftCard?.to_email
        ? user?.user == userGiftCard?.to_email
          ? "Self"
          : userGiftCard?.to_email
        : "Self";
      giftCardDetail.dataValues.purchase_for = purchase_for;
      giftCardDetail.dataValues.purchase_date =
        userGiftCard?.purchase_date || "";
      giftCardDetail.dataValues.redeemed_amount =
        userGiftCard?.redeemed_amount || "";
      if(userGiftCard?.from) {
        giftCardDetail.dataValues.from = userGiftCard?.from || "";
        giftCardDetail.dataValues.note = userGiftCard?.note || "";
      }
    }
    var rewardHistoryModel = models.reward_history
    let giftcardLoyalty = await rewardHistoryModel.findAll({
      where: {
        user_gift_card_id: userGiftCard?.id,
        credit_debit: true,
        reference_reward_type: 'loyalty_points'
      },
    });
    var tLoyalty = 0.00;
    if(!_.isEmpty(giftcardLoyalty)) {
      for(const amount of giftcardLoyalty) {
        tLoyalty += parseFloat(amount.amount)
      }
    }

    giftCardDetail.dataValues.points_earned = tLoyalty;
    giftCardDetail.dataValues.points_redeemed = giftcardLoyalty?.amount;

    // Earned cashbacks
    giftCardDetail.dataValues.earned_cashbacks = '0.00';
    giftCardDetail.dataValues.giftcard_amount = userGiftCard?.giftcard_amount ?? '0.00';
    giftCardDetail.dataValues.business_revenue = userGiftCard?.business_revenue ?? null;
    giftCardDetail.dataValues.admin_revenue = userGiftCard?.admin_revenue ?? null;
    giftCardDetail.dataValues.stripe_fee = userGiftCard?.stripe_fee ?? null;


    if(giftCardDetail.is_cashback) {
      giftCardDetail.dataValues.earned_cashbacks = giftCardDetail.amount * giftCardDetail.cashback_percentage / 100
    }

    giftCardDetail.dataValues.totalPurchase =
      totalPurchasedGiftcard?.length || 0;

    return res.send(
      setRes(resCode.OK,true,"User Virtual card details!",giftCardDetail)
    );
  } catch(error) {
    return res.send(
      setRes(resCode.BadRequest,false,"Something went wrong!",null)
    );
  }
};

// Function to generate filters
function generateFilters(min,max,size) {
  const midValue = Math.floor((min + max) / size);

  return [
    {
      name: `Below ${min}`,
      value: `0 - ${min}`,
    },
    {
      name: `${min}-${midValue}`,
      value: `${min} - ${midValue}`,
    },
    {
      name: `${midValue + 1}-${max}`,
      value: `${midValue + 1} - ${max}`,
    },
    {
      name: `Above ${max}`,
      value: `${max} - ${max + 10}`,
    },
  ];
}

// follow unfollow bussiness
exports.followUnfollowBusinesses = async (req,res) => {
  try {
    var data = req.body
    const FollowUnfollowModel = models.follow_unfollow_businesses;
    var requiredFields = _.reject(["status","business_id","user_id"],(o) => {
      return _.has(data,o);
    });
    if(requiredFields == "") {
      const exist = await FollowUnfollowModel.findOne({
        where: {
          business_id: data.business_id,
          user_id: data.user_id
        },
        include: [
          {
            model: models.business,
            where: {
              is_deleted: false,
              is_active: true
            }
          }
        ]
      })
      if(!_.isNull(exist)) {
        const update = await FollowUnfollowModel.update({
          status: data.status
        },{
          where: {
            business_id: data.business_id,
            user_id: data.user_id
          }
        })
        if(data.status == true) {
          return res.send(setRes(resCode.OK,true,`Followed successfully`,null))
        } else {
          return res.send(setRes(resCode.OK,true,`Unfollowed successfully`,null))
        }
      } else {
        const inserted = await FollowUnfollowModel.create(data)
        const business = await models.business.findOne({
          where: {
            id: data.business_id,
            is_deleted: false,
            is_active: true
          }
        })
        if(inserted) {
          return res.send(setRes(resCode.OK,true,`${business?.business_name} followed successfully`,inserted));
        }
      }
    } else {
      return res.send(setRes(resCode.BadRequest,false,requiredFields.toString() + " are required",null));
    }
  } catch(error) {
    return res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null));
  }
}

// Loyalty token card list 
exports.userLoyaltyTokenCardsListOld = async (req,res) => {
  try {
    const data = req.body;
    const user = req?.user;
    const userModel = models.user;
    const businessModel = models.business;
    const followUnfollowBusinessModel = models.follow_unfollow_businesses
    const loyaltyCardHistoryModel = models.loyalty_token_card_history
    var requiredFields = _.reject(["page","page_size"],(o) => {
      return _.has(data,o);
    });
    const userDetails = await userModel.findOne({
      where: {email: user?.user,is_active: true,is_deleted: false},
    });
    if(!userDetails) {
      return res.send(
        setRes(resCode.ResourceNotFound,false,"User not found",null)
      );
    }
    if(requiredFields == '') {
      if(data.page < 0 || data.page == 0) {
        return res.send(
          setRes(
            resCode.BadRequest,
            false,
            "invalid page number, should start with 1",
            null
          )
        );
      }
      const skip = data.page_size * (data.page - 1);
      const limit = parseInt(data.page_size);
      const condition = {
        where: {user_id: user?.id,status: true},
        include: [
          {
            model: models.business,
            where: {
              is_deleted: false,
              is_active: true,
            },
            attributes: ['id','business_name'],
          },
        ]
      }
      if(data.page_size != 0 && !_.isEmpty(data.page_size)) {
        (condition.offset = skip),(condition.limit = limit);
      }
      await followUnfollowBusinessModel.findAndCountAll(condition).then(async followedBusinessData => {
        if(followedBusinessData.rows.length != 0) {
          const loyaltyCardsArray = [];
          for(const item of followedBusinessData.rows) {
            const searchCondition = {
              where: {
                id: item.business?.id,
                is_deleted: false,
                is_active: true,
              },
              include: [
                {
                  model: models.loyalty_token_cards,
                  where: {
                    status: true,
                    is_deleted: false
                  },
                  attributes: ['id','name','description','min_purchase_amount','no_of_tokens'],
                  include: {
                    model: models.loyalty_token_icon,
                    attributes: ['default_image',"active_image"]
                  }
                }
              ],
              attributes: ['id','business_name']
            }
            const response = await businessModel.findOne(searchCondition)
            if(response) {
              if(response.loyalty_token_cards?.[0].loyalty_token_icon !== null && response.loyalty_token_cards?.[0].loyalty_token_icon !== undefined) {
                if(response.loyalty_token_cards?.[0].loyalty_token_icon.default_image) {
                  await awsConfig
                    .getSignUrl(response.loyalty_token_cards?.[0].loyalty_token_icon.default_image)
                    .then(function(res) {
                      response.loyalty_token_cards[0].loyalty_token_icon.default_image = res;
                    });
                }
                if(response.loyalty_token_cards?.[0].loyalty_token_icon.active_image) {
                  await awsConfig
                    .getSignUrl(response.loyalty_token_cards?.[0].loyalty_token_icon.active_image)
                    .then(function(res) {
                      response.loyalty_token_cards[0].loyalty_token_icon.active_image = res;
                    });
                }
              }
              const responseBody = {
                id: response.loyalty_token_cards?.[0].id,
                name: response.loyalty_token_cards?.[0].name,
                no_of_tokens: response.loyalty_token_cards?.[0].no_of_tokens,
                description: response.loyalty_token_cards?.[0].description,
                minimum_purchase_amount: response.loyalty_token_cards?.[0].minimum_purchase_amount,
                business_id: response?.id,
                business_name: response.business_name,
                loyalty_token_icon: response.loyalty_token_cards?.[0].loyalty_token_icon,
              }
              loyaltyCardsArray.push(responseBody)
            }
          }
          const loyaltyCardUpdatedArray = loyaltyCardsArray?.map((item) => {
            return loyaltyCardHistoryModel.findAndCountAll({
              where: {business_id: item?.business_id,user_id: user?.id,loyalty_token_card_id: item?.id,is_deleted: false,status: true},
            }).then((history) => {
              item.no_of_use = history.count
              return item
            })
          })
          const loyaltyCardFinalArray = await Promise.all(loyaltyCardUpdatedArray)

          /*filtering data acoording to search data */
          if(data.search && !_.isNull(data.search)) {
            const result = function searchBusinesses() {
              return loyaltyCardFinalArray.filter(business => {
                const matchesBusiness = business.business_name.toLowerCase().includes(data.search.toLowerCase());
                const matchesLoyaltyCard = business.token_name.toLowerCase().includes(data.search.toLowerCase());
                return matchesBusiness || matchesLoyaltyCard;
              });
            }()
            if(result.length != 0) {
              const response = new pagination(
                result,
                result.length,
                parseInt(data.page),
                parseInt(data.page_size)
              )
              return res.send(setRes(resCode.OK,true,"Get loyalty token card list successfully",response.getPaginationInfo()))
            } else {
              return res.send(setRes(resCode.OK,true,"Loyalty token card is not found",null))
            }
          } else {
            const response = new pagination(
              loyaltyCardFinalArray,
              followedBusinessData.count,
              parseInt(data.page),
              parseInt(data.page_size)
            );
            return res.send(setRes(resCode.OK,true,"Get loyalty token cards fetched successfully",response.getPaginationInfo()))
          }
        } else {
          return res.send(setRes(resCode.OK,true,"Loyalty token card is not available",null))
        }
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
  } catch(error) {
    console.log(error);
    res.send(setRes(resCode.BadRequest,false,"something went wrong",null));
  }
}

exports.userLoyaltyTokenCardsList = async (req,res) => {
  try {
    var data = req.body;
    var claimProductModel = models.loyalty_token_claim_product;
    var authUser = req?.user;
    var skip = data.page_size * (data.page - 1);
    var limit = parseInt(data.page_size);
    var searchPattern = data?.search ? "%" + data.search + "%" : null;
    const userId = authUser?.id;
    const countQuery = `SELECT ltc.id,ltc.min_purchase_amount, ltc.business_id, ltc.name, ltc.no_of_tokens, ltc.description, b.business_name, lti.default_image, lti.active_image,
    (
      SELECT COUNT(*) FROM loyalty_token_card_histories
      WHERE business_id = ltc.business_id
        AND user_id = :userId
        AND loyalty_token_card_id = ltc.id
        AND is_deleted = false
        AND status = true
    ) as no_of_use
                  FROM loyalty_token_cards AS ltc
                  JOIN follow_unfollow_businesses AS fub ON fub.business_id = ltc.business_id
                  JOIN businesses AS b ON b.id = fub.business_id
                  JOIN loyalty_token_icons AS lti ON lti.id = ltc.token_icon_id
                  WHERE fub.user_id = :userId AND fub.status = 1 AND ltc.status = 1 AND ltc.is_deleted = 0
                  ${searchPattern ? `AND (b.business_name LIKE :searchPattern OR ltc.description LIKE :searchPattern OR ltc.name LIKE :searchPattern)` : ''}
                  GROUP BY ltc.business_id;`;

    const resultsForCount = await models.sequelize.query(countQuery,{
      replacements: {userId,searchPattern: `%${searchPattern}%`}, // Adjust the searchPattern as needed
      type: Sequelize.QueryTypes.SELECT,
    });

    let query = `SELECT ltc.id,p.name AS product_name,ltc.min_purchase_amount, ltc.business_id, ltc.name, ltc.no_of_tokens, ltc.description, b.business_name, lti.default_image, lti.active_image,
    (
      SELECT COUNT(*) FROM loyalty_token_card_histories
      WHERE business_id = ltc.business_id
        AND user_id = :userId
        AND loyalty_token_card_id = ltc.id
        AND is_deleted = false
        AND status = true
    ) as no_of_use
    FROM loyalty_token_cards AS ltc
    JOIN follow_unfollow_businesses AS fub ON fub.business_id = ltc.business_id
    JOIN businesses AS b ON b.id = fub.business_id
    JOIN products AS p ON p.id = ltc.product_id
    JOIN loyalty_token_icons AS lti ON lti.id = ltc.token_icon_id
    WHERE fub.user_id = :userId AND fub.status = 1 AND ltc.status = 1 AND ltc.is_deleted = 0
    ${searchPattern ? `AND (b.business_name LIKE :searchPattern OR ltc.description LIKE :searchPattern OR ltc.name LIKE :searchPattern)` : ''}
    GROUP BY ltc.business_id`;

    if(data.page_size != 0 && !_.isEmpty(data.page_size)) {
      query += ` LIMIT ${limit} OFFSET ${skip}`;
    }

    const results = await models.sequelize.query(query,{
      replacements: {userId,searchPattern: `%${searchPattern}%`}, // Adjust the searchPattern as needed
      type: Sequelize.QueryTypes.SELECT,
    });

    for(const data of results) {
      if(data.default_image != null) {
        const signurl = await awsConfig
          .getSignUrl(data.default_image)
          .then(function(res) {
            data.default_image = res;
          });
      } else {
        data.default_image = commonConfig.default_image;
      }

      if(data.active_image != null) {
        const signurl = await awsConfig
          .getSignUrl(data.active_image)
          .then(function(res) {
            data.active_image = res;
          });
      } else {
        data.active_image = commonConfig.default_image;
      }

      const productAdded = await claimProductModel.findOne({
        where: {
          loyalty_token_card_id: data.id,
          user_id: authUser.id,
          status: true,
          is_deleted: false
        }
      });
      var is_added_lcp = false;
      if(productAdded && !_.isNull(productAdded)) {
        is_added_lcp = true
      }
      data.is_added_lcp = is_added_lcp;
    }
    const response = new pagination(
      results,
      resultsForCount.length,
      parseInt(data.page),
      parseInt(data.page_size)
    );

    return res.send(setRes(resCode.OK,true,"Get loyalty token card list successfully.",response.getPaginationInfo()))
  } catch(error) {
    console.log(error)
    return res.send(setRes(resCode.BadRequest,false,'Something went wrong.',null));
  }
}

exports.claimFreeProduct = async (req,res) => {
  try {
    const data = req.body
    const user = req.user
    const loyaltyCardModel = models.loyalty_token_cards
    const productModel = models.products
    const loyaltyHistoryModel = models.loyalty_token_card_history
    const loyaltyTokenCardFreeProductModel = models.loyalty_token_claim_product
    var requiredFields = _.reject(["business_id","loyalty_token_card_id"],(o) => {
      return _.has(data,o);
    });
    if(requiredFields == '') {
      const loyaltyCard = await loyaltyCardModel.findOne({
        where: {status: true,is_deleted: false,business_id: data.business_id,id: data.loyalty_token_card_id},
        include: productModel,
        attributes: ['no_of_tokens']
      })
      if(_.isNull(loyaltyCard)) {
        return res.send(setRes(resCode.BadRequest,false,"Invalid loyalty card",null))
      }
      const {count} = await loyaltyHistoryModel.findAndCountAll({where: {status: true,is_deleted: false,business_id: data.business_id,user_id: user?.id,loyalty_token_card_id: data.loyalty_token_card_id}})
      if(loyaltyCard.no_of_tokens == count) {
        const exist = await loyaltyTokenCardFreeProductModel.findOne({where: {status: true,is_deleted: false,business_id: data.business_id,loyalty_token_card_id: data.loyalty_token_card_id,user_id: user?.id,is_claimed: false}})
        if(!_.isEmpty(exist)) {
          return res.send(setRes(resCode.BadRequest,false,"Already Claimed free product"))
        }
        const body = {
          user_id: user.id,
          business_id: data.business_id,
          loyalty_token_card_id: data.loyalty_token_card_id,
          product_id: loyaltyCard.product.id,
          product_name: loyaltyCard.product.name,
          product_price: loyaltyCard.product.price
        }
        const claimed = await loyaltyTokenCardFreeProductModel.create(body)
        if(claimed) {
          return res.send(setRes(resCode.OK,true,"Free Product Claimed Successfully"))
        }
      } else {
        return res.send(setRes(resCode.BadRequest,false,`${loyaltyCard.no_of_tokens - count} purchases away to collect free product`,null))
      }
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
  } catch(error) {
    console.log(error);
    res.send(setRes(resCode.BadRequest,false,"something went wrong",null));
  }
}

exports.makeEntry = async (req,res) => {
  try {
    const data = req.body
    const user = req.user
    const productModel = models.products
    const loyaltyHistoryModel = models.loyalty_token_card_history
    const loyaltyTokenFreeProductModel = models.loyalty_token_claim_product
    const loyaltyCardModel = models.loyalty_token_cards
    var requiredFields = _.reject(["business_id","order_id","order_no","loyalty_token_card_id"],(o) => {
      return _.has(data,o);
    });
    if(requiredFields == '') {
      const loyaltyCard = await loyaltyCardModel.findOne({
        where: {status: true,is_deleted: false,business_id: data.business_id},
        include: productModel,
        attributes: ['no_of_tokens']
      })
      const loyaltyCardHistory = await loyaltyHistoryModel.findAndCountAll({
        where: {status: true,is_deleted: false,user_id: user?.id,business_id: data.business_id}
      })
      if(loyaltyCard.no_of_tokens <= loyaltyCardHistory?.count) {
        return res.send(setRes(resCode.OK,true,"Excided limit , This loyalty card can not be used",null));
      }
      else {
        const inserted = await loyaltyHistoryModel.create({...data,user_id: user.id})
        return res.send(setRes(resCode.OK,true,"Loyalty token stored successfully",inserted));
      }
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
  } catch(error) {
    console.log(error);
    res.send(setRes(resCode.BadRequest,false,"something went wrong",null));
  }
}

async function sendGiftCardShareNotificationToBusinessUser(requestedData,userDetails,userGiftCard,giftCardDetails) {
  try {
    var notificationModel = models.notifications;
    var notificationReceiverModel = models.notification_receivers;
    var deviceModel = models.device_tokens;
    /** Send Puch Notification */
    const notificationObj = {
      params: JSON.stringify({
        notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
        title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
          userDetails?.username
        ),
        message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
          userDetails?.username,
          giftCardDetails?.name
        ),
        giftcard_id: requestedData.gift_card_id,
        user_id: userDetails.id,
        business_id: giftCardDetails.business_id,
      }),
      title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
        userDetails?.username
      ),
      message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
        userDetails?.username,
        giftCardDetails?.name
      ),
      notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
    };
    const notification = await notificationModel.create(notificationObj);
    if(notification && notification.id) {
      const notificationReceiverObj = {
        role_id: 3,
        notification_id: notification.id,
        receiver_id: giftCardDetails.business_id,
        is_read: false,
      };
      const notificationReceiver = await notificationReceiverModel.create(
        notificationReceiverObj
      );
    }
    /** FCM push noifiation */
    const activeReceiverDevices = await deviceModel.findAll(
      {where: {status: 1,business_id: giftCardDetails.business_id}},
      {attributes: ["device_token"]}
    );
    const deviceTokensList = activeReceiverDevices.map(
      (device) => device.device_token
    );
    const uniqueDeviceTokens = Array.from(new Set(deviceTokensList));
    const notificationPayload = {
      device_token: uniqueDeviceTokens,
      title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
        userDetails?.username
      ),
      message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
        userDetails?.username,
        giftCardDetails?.name
      ),
      content: {
        notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
        notification_id: notification.id,
        title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
          userDetails?.username
        ),
        message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
          userDetails?.username,
          giftCardDetails?.name
        ),
        giftcard_id: requestedData.gift_card_id,
        user_id: userDetails.id,
        business_id: giftCardDetails.business_id,
      },
    };
    await fcmNotification.SendNotification(notificationPayload);
  } catch(error) {
    console.log(error);
    res.send(setRes(resCode.BadRequest,false,"something went wrong",null));
  }
}
