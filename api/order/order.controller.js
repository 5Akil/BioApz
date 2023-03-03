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

exports.OrderHistory = async(req,res) => {

	var data = req.body;
	var orderModel = models.orders

	var requiredFields = _.reject(['user_id','page','page_size'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
		if(parseInt(data.page) < 0 || parseInt(data.page) === 0) {
			res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
		
		var condition = {
			offset:skip,
			limit : limit,
			subQuery:false,
			order: [
				['createdAt', 'DESC']
			],
			attributes: { exclude: ['is_deleted', 'updatedAt'] }
		}
		if(data.delivery_status){
			 condition.where = {user_id:data.user_id,delivery_status:data.delivery_status,is_deleted: false}	
		}
		data.delivery_status ? condition.where = {user_id:data.user_id,delivery_status:data.delivery_status,is_deleted: false} : condition.where = {user_id:data.user_id, is_deleted: false},
		data.order_status ? condition.where = {user_id:data.user_id,order_status:data.order_status,is_deleted: false} : condition.where = {user_id:data.user_id, is_deleted: false},
		
		orderModel.findAll(condition).then(OrderData => {
			if(OrderData.length > 0){
				res.send(setRes(resCode.OK,OrderData,null,'Order history find successfully'))
			}else{
				res.send(setRes(resCode.ResourceNotFound,null,true,'Order history not found'))
			}
		})
		
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}