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
var commonConfig = require('../../config/common_config')

exports.OrderHistory = async(req,res) => {

	var data = req.body;
	var orderModel = models.orders
	const orderDetailsModel = models.order_details
	var businessModel = models.business
	const productModel = models.products
	const categoryModel = models.product_categorys
	const userModel = models.user;
	var Op = models.Op
	const userEmail = req.userEmail;

	var requiredFields = _.reject(['page','page_size','order_type'], (o) => { return _.has(data, o)  })
	const user = await userModel.findOne({ where: {email : userEmail, is_deleted: false} });
	if(requiredFields == ""){
		if (user) {
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
					model: businessModel,
					attributes: ['banner','business_name'] 
					},
					{
						model: orderDetailsModel,
						required: true,
						include: [{
							model: productModel,
							include: [{
								model: categoryModel,
								as: 'product_categorys',
								where: {
									is_deleted: false,
									is_enable: true
								}								
							}],
							attributes: []
						}],
						attributes: []
					}
				],
				subQuery:false,
				order: [
					['createdAt', 'DESC']
				],
				attributes: { exclude: ['is_deleted', 'updatedAt','delivery_status','payment_response','payment_status'] }
			}
			condition.where = {order_status:1,user_id:user.id,is_deleted: false}
			if(data.order_type == 0){
				condition.where = {order_status:{ [Op.in]: [2,3] },user_id:user.id,is_deleted: false}
			}
			
			const recordCount = await orderModel.findAndCountAll(condition);
			const totalRecords = recordCount?.count;

			orderModel.findAll(condition).then(async OrderData => {
				if(OrderData.length > 0){
					for(const data of OrderData){
						
						data.dataValues.business_name = data.business.business_name
	
						if(data.business.banner != null){
	
							const signurl = await awsConfig.getSignUrl(data.business.banner).then(function(res){
								data.dataValues.banner = res
							})
						}else{
							data.dataValues.banner = commonConfig.default_image;
						}
						delete data.dataValues.business;
					}

					const previous_page = (data.page - 1);
					const last_page = Math.ceil(totalRecords / data.page_size);
					let next_page = null;
					if(last_page > data.page){
						var pageNumber = data.page;
						next_page = +(pageNumber) + 1;
					}

					const response = {};
					response.totalPages = Math.ceil(totalRecords/limit);
					response.currentPage = parseInt(data.page);
					response.per_page = parseInt(data.page_size);
					response.total_records = totalRecords;
					response.data = OrderData;
					response.previousPage = previous_page;
					response.nextPage = next_page;
					response.lastPage = last_page;
					res.send(setRes(resCode.OK,true,'Order history get successfully',response))
				}else{
					res.send(setRes(resCode.ResourceNotFound,false,'Order history not found',null))
				}
			})
		} else {
			res.send(setRes(resCode.ResourceNotFound,false,'Authorized User not found',null))
		}
		
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.OrderDetail = async (req,res) => {

	var data = req.params
	const orderModel = models.orders;
	var orderDetailsModel = models.order_details
	var productModel = models.products
	var categoryModel = models.product_categorys
	const userModel = models.user;
	const userEmail = req.userEmail;

	const user = await  userModel.findOne({  where: { email : userEmail, is_deleted: false } });
	var Op = models.Op

	if (user) {
		orderDetailsModel.findAll({
		  where: {
			order_id: data.id
		  },
		  include: [
			{
				model: orderModel,
				required:true,
				attributes: ['amount'],
			},
			{
			  model: productModel,
			  required:true,
			  attributes: ['image','name','price','category_id','sub_category_id'],
			  include:  [{
				model: categoryModel,
				as: 'product_categorys',
			  },
			  {
				model: categoryModel,
				as: 'sub_category',
				attributes:{ include: ['name','is_deleted']}
			  }
			  ]
			}
		  ],
		  attributes: { exclude: ['is_deleted', 'updatedAt','price','business_id','product_id'] }
		}).then(async orderDetails => {
			const orderdata = {
				amount: orderDetails[0]?.order?.amount || '',				
			}
			for (data of orderDetails) {
				data.dataValues.category_name = data?.product?.product_categorys?.name
				data.dataValues.product_type = data?.product?.sub_category?.name
				data.dataValues.product_name = data?.product?.name
				data.dataValues.product_price = data?.product?.price
				data.dataValues.product_image = ''
				if (data?.dataValues?.product_image){
					const signurl = await awsConfig.getSignUrl(data.product.image[0]).then(function(res){
						data.dataValues.product_image = res
					})
				}
				delete data?.product?.dataValues?.product_categorys
				delete data?.product?.dataValues?.sub_category
				delete data?.dataValues?.product
				delete data?.dataValues?.order
				
			}
			const products = [];
	
			orderDetails.forEach((order) => {
			  const product = order.product;
			  products.push(product);
			});
			
			orderdata['products'] = products;
			if (orderdata) {
				res.send(setRes(resCode.OK,true,'Get order details successfully',orderdata))
			} else {
				res.send(setRes(resCode.ResourceNotFound,false,'Order details not found',null))
			}
		}).catch(error => {	
			res.send(setRes(resCode.BadRequest,false,'Fail to get order details',null))
		})
	} else {
		res.send(setRes(resCode.ResourceNotFound,false,'Authorized User not found',null))
	}
}
 
exports.BusinessOrderHistory = async(req,res) => {

	var data = req.body;
	var orderModel = models.orders
	var userModel = models.user
	var businessModel = models.business
	var Op = models.Op
	const userEmail = req.userEmail;

	var requiredFields = _.reject(['page','page_size','order_type'], (o) => { return _.has(data, o)  })
	if(requiredFields == ""){
		const business = await  businessModel.findOne({ where: { email : userEmail, is_deleted: false } });
		if (business) {
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
			condition.where = {order_status:1,business_id:business.id,is_deleted: false}
			if(data.order_type == 0){
				condition.where = {order_status:{ [Op.in]: [2,3] },business_id:business.id,is_deleted: false}
			}
			
			const recordCount = await orderModel.findAndCountAll(condition);
			const totalRecords = recordCount?.count;

			orderModel.findAll(condition).then(async OrderData => {
				if(OrderData.length > 0){
					for(const data of OrderData){
						data.dataValues.user_name = data.user.username
						data.dataValues.business_name = data.business.business_name
						delete data.dataValues.user
						delete data.dataValues.business
					}
					const previous_page = (data.page - 1);
					const last_page = Math.ceil(totalRecords / data.page_size);
					let next_page = null;
					if(last_page > data.page){
						var pageNumber = data.page;
						next_page = +(pageNumber) + 1;
					}

					const response = {};
					response.totalPages = Math.ceil(totalRecords/limit);
					response.currentPage = parseInt(data.page);
					response.per_page = parseInt(data.page_size);
					response.total_records = totalRecords;
					response.data = OrderData;
					response.previousPage = previous_page;
					response.nextPage = next_page;
					response.lastPage = last_page;
					res.send(setRes(resCode.OK,null,'Order history get successfully',response))
				}else{
					res.send(setRes(resCode.ResourceNotFound,false,'Order history not found',null))
				}
			})
		} else {
			res.send(setRes(resCode.ResourceNotFound,false,'Authorized Business User not found',null))
		}
		
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
	const businessModel = models.business
	const userEmail = req.userEmail;

	const business = await businessModel.findOne({ where: { email : userEmail, is_deleted: false } });
	if (business) {
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
				data.product.dataValues.category_name = data?.product?.product_categorys?.name
				data.product.dataValues.product_type = data?.product?.sub_category?.name
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
			res.send(setRes(resCode.InternalServer,false,'Internal server error.',null))
		})
	} else {
		res.send(setRes(resCode.ResourceNotFound,false,'Authorized Business User not found',null))
	}
}