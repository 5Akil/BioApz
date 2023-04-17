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
const Sequelize = require('sequelize');

exports.OrderHistory = async(req,res) => {

	var data = req.body;
	var orderModel = models.orders
	var businessModel = models.business
	var Op = models.Op

	var requiredFields = _.reject(['user_id','page','page_size','order_type'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
		if(parseInt(data.page) < 0 || parseInt(data.page) === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
		
		var condition = {
			offset:skip,
			limit : limit,
			
			include: {
				model: businessModel,
				attributes: ['banner','business_name'] 
			},
			subQuery:false,
			order: [
				['createdAt', 'DESC']
			],
			attributes: { exclude: ['is_deleted', 'updatedAt','delivery_status','payment_response','payment_status'] }
		}
		condition.where = {order_status:1,user_id:data.user_id,is_deleted: false}
		if(data.order_type == 0){
			condition.where = {order_status:{ [Op.in]: [2,3] },user_id:data.user_id,is_deleted: false}
		}
		
		
		orderModel.findAll(condition).then(async OrderData => {
			if(OrderData.length > 0){
				for(const data of OrderData){
					
					data.dataValues.business_name = data.business.business_name

					if(data.business.banner != null){

						const signurl = await awsConfig.getSignUrl(data.business.banner).then(function(res){
							data.dataValues.banner = res
						})
					}else{
						data.dataValues.banner = commonConfig.app_url+'/public/defualt.png'
					}
					delete data.dataValues.business;
				}
				res.send(setRes(resCode.OK,true,'Order history get successfully',OrderData))
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,'Order history not found',null))
			}
		})
		
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.OrderDetail = async (req,res) => {

	var data = req.params
	var orderDetailsModel = models.order_details
	var productModel = models.products
	var categoryModel = models.product_categorys
	var Op = models.Op

	orderDetailsModel.findAll({
	  where: {
	    order_id: data.id
	  },
	  include: [
	    {
	      model: productModel,
	      attributes: ['image','name','price','category_id','sub_category_id'],
	      include:  [{
	        model: categoryModel,
	        as: 'product_categorys',
	        attributes:['name']
	      },
	      {
	        model: categoryModel,
	        as: 'sub_category',
	        attributes:['name']
	      }
	      ]
	    }
	  ],
	  attributes: { exclude: ['is_deleted', 'updatedAt','price','business_id','product_id'] }
	}).then(async orderDetails => {
		for(data of orderDetails){
			data.dataValues.category_name = data.product.product_categorys.name
			data.dataValues.product_type = data.product.sub_category.name
			data.dataValues.product_name = data.product.name
			data.dataValues.product_price = data.product.price
			const signurl = await awsConfig.getSignUrl(data.product.image[0]).then(function(res){
				data.dataValues.product_image = res
			})
			delete data.product.dataValues.product_categorys
			delete data.product.dataValues.sub_category
			delete data.dataValues.product
			
		}
		res.send(setRes(resCode.OK,true,'Get order details successfully',orderDetails))
	}).catch(error => {	
		res.send(setRes(resCode.InternalServer,false,'Fail to get order details',null))
	})
}

exports.BusinessOrderHistory = async(req,res) => {

	var data = req.body;
	var orderModel = models.orders
	var userModel = models.user
	var businessModel = models.business
	var Op = models.Op

	var requiredFields = _.reject(['business_id','page','page_size','order_type'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
		if(parseInt(data.page) < 0 || parseInt(data.page) === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
		
		var condition = {
			offset:skip,
			limit : limit,
			
			include: [
				{
					model: userModel,
					attributes: ['username'] 
				},
				{
					model:businessModel,
					attributes : ['business_name']
				}

			],
			subQuery:false,
			order: [
				['createdAt', 'DESC']
			],
			attributes: { exclude: ['is_deleted', 'updatedAt','delivery_status','payment_response','payment_status'] }
		}
		condition.where = {order_status:1,business_id:data.business_id,is_deleted: false}
		if(data.order_type == 0){
			condition.where = {order_status:{ [Op.in]: [2,3] },business_id:data.business_id,is_deleted: false}
		}
		
		
		orderModel.findAll(condition).then(async OrderData => {
			if(OrderData.length > 0){
				for(const data of OrderData){
					data.dataValues.user_name = data.user.username
					data.dataValues.business_name = data.business.business_name
					delete data.dataValues.user
					delete data.dataValues.business
				}
				res.send(setRes(resCode.OK,null,'Order history get successfully',OrderData))
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,'Order history not found',null))
			}
		})
		
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.BusinessOrderDetail = async (req,res) => {

	var data = req.params
	var orderDetailsModel = models.order_details
	var productModel = models.products
	var categoryModel = models.product_categorys
	var userModel = models.user
	var Op = models.Op

	orderDetailsModel.findAll({
	  where: {
	    order_id: data.id
	  },
	  include: [
	    {
	      model: productModel,
	      attributes: ['image','name','price','category_id','sub_category_id'],
	      include:  [{
	        model: categoryModel,
	        as: 'product_categorys',
	        attributes:['name']
	      },
	      {
	        model: categoryModel,
	        as: 'sub_category',
	        attributes:['name']
	      }
	      ],

	    },
	    {
			model: userModel,
			attributes: ['username','email','address','mobile'] 
		},

	  ],
	  attributes: { exclude: ['is_deleted', 'updatedAt','price','business_id','product_id'] }
	}).then(async orderDetails => {
		var product_details = {};
		for(data of orderDetails){
			data.dataValues.user_name = data.user.username
			data.dataValues.user_email = data.user.email
			data.dataValues.user_mobile = data.user.mobile
			data.dataValues.user_address = data.user.address
			delete data.dataValues.user
			data.product.dataValues.category_name = data.product.product_categorys.name
			data.product.dataValues.product_type = data.product.sub_category.name
			data.product.dataValues.qty = data.qty
			const signurl = await awsConfig.getSignUrl(data.product.image[0]).then(function(res){
				data.product.dataValues.product_image = res
			})
			delete data.product.dataValues.sub_category_id
			delete data.product.dataValues.image
			delete data.product.dataValues.product_categorys
			delete data.product.dataValues.sub_category
			delete data.dataValues.qty
			
		}
		const products = [];

		orderDetails.forEach((order) => {
		  const product = order.product;
		  products.push(product);
		});
		
		const datas = {
			"user_id": orderDetails[0].user_id,
			"user_name" : orderDetails[0].user.username,
			"user_mobile" : orderDetails[0].user.mobile,
			"user_email" : orderDetails[0].user.email,
			"user_address" : orderDetails[0].user.address,
            "order_id": orderDetails[0].order_id,
            "createdAt": orderDetails[0].createdAt,
            "product" : products
		}
		orderDetails = datas
		res.send(setRes(resCode.OK,true,'Get order details successfully',orderDetails))
	}).catch(error => {	
		res.send(setRes(resCode.InternalServer,false,'Fail to get order details',null))
	})
}