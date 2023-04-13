var async = require('async')
var crypto = require('crypto')
var EmailTemplates = require('swig-email-templates')
var nodemailer = require('nodemailer')
var path = require('path')
var resCode = require('../../config/res_code_config')
var setRes = require('../../response')
var jwt = require('jsonwebtoken');
var models = require('../../models')
var bcrypt = require('bcrypt')
var _ = require('underscore')
var mailConfig = require('../../config/mail_config')
var awsConfig = require('../../config/aws_S3_config')
var util = require('util')
var notification = require('../../push_notification');

exports.GetGiftCardTemplate = async(req,res) => {
	
	var giftCardTemplateModel = models.gift_card_template
	
	
	giftCardTemplateModel.findAll({
		where: {
				
				is_enable: true,
				is_deleted: false
			},
		order: [
				['createdAt', 'DESC']
			],
			
	}).then(async templates => {
		if (templates != '' && templates != null ){
			// Update Sign URL
			for(const data of templates){
			  const signurl = await awsConfig.getSignUrl(`${data.template_image}`).then(function(res){

			  	data.template_image = res;		  
			  });
			}
				res.send(setRes(resCode.OK, templates, false, "Get templates detail successfully.."))
			}else{
				res.send(setRes(resCode.ResourceNotFound, null, false, "Templates not found."))
			}
			
		}).catch(error => {
			res.send(setRes(resCode.BadRequest, null, true, "Fail to send request."))
		})
}