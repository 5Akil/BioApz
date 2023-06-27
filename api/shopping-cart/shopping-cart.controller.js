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
var commonConfig = require('../../config/common_config')
const { condition } = require('sequelize')

exports.AddToCart = async(req,res) => {
	
	var data = req.body
	var shoppingCartModel = models.shopping_cart
	var orderDetailsModel = models.order_details
	var businessModel = models.business
	var userModel = models.user
	var Op = models.Op
	var productModel = models.products

	var requiredFields = _.reject(['business_id','user_id', 'product_id', 'qty','price'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){
		businessModel.findOne({
			where: { id: data.business_id, is_deleted: false, is_active: true }
		}).then(async business => {
			if (_.isEmpty(business)) {
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
			} else {
				userModel.findOne({
					where:{
						id:data.user_id,
						is_deleted:false,
						is_active:true
					}
				}).then(async user => {
					if(_.isEmpty(user)){
						res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
					}else{
						productModel.findOne({
							where:{
								id:data.product_id,
								is_deleted:false
							}
						}).then(async product => {
							if(_.isEmpty(product)){
								res.send(setRes(resCode.ResourceNotFound, false, "Product not found.",null))
							}else{
								await orderDetailsModel.findOne({where: {business_id : data.business_id,product_id:data.product_id, is_deleted: false}}).then(async OrderData => {
									if(OrderData == null){
										await shoppingCartModel.findAll({where:{business_id : data.business_id,user_id:data.user_id}}).then(async productData => {
											if (productData != null) {
												await shoppingCartModel.findOne({where: {business_id : data.business_id,user_id: data.user_id,product_id : data.product_id, is_deleted: false}}).then(async product => {
													if(product == null){
														await shoppingCartModel.create(data).then(async function (cartData) {
															if (cartData) {
																var updatedData = await shoppingCartModel.update({
																	is_deleted:true
																},{
																	where:{business_id : {[Op.ne] :data.business_id},user_id : {[Op.eq] :data.user_id}}
																});
																console.log(updatedData)
																return res.send(setRes(resCode.OK, true, 'Product added into cart successfully.', cartData));
															} else {
																return res.send(setRes(resCode.BadRequest, false, 'Fail to add into cart', null));
															}
														});
													}else{
						
												res.send(setRes(resCode.BadRequest, false, 'Product already into a cart...',null));
											}
												})
												
											}
										});
									}else{
										res.send(setRes(resCode.ResourceNotFound,false,'Product not available..',null))
									}
								})
							}
						})
					}
				})
			}})
		
		
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
	
}

exports.CartList = async(req,res) => {

	var data = req.body
	var shoppingCartModel = models.shopping_cart
	var productCategoryModel = models.product_categorys
	var productModel = models.products;

	var requiredFields = _.reject(['page','page_size','user_id'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){

		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)

		var condition = {
			include: [
				{
					model: productModel,
					include:[
						{
							model: productCategoryModel,
							as: 'product_categorys',
							attributes:['name']
						},
						{
							model: productCategoryModel,
							as: 'sub_category',
							attributes:['name']
						}
					]
				}
			],
		}
		if(data.page_size != 0 && !_.isEmpty(data.page_size)){
			condition.offset = skip,
			condition.limit = limit
		}
		condition.where = {
			user_id: data.user_id,
			is_deleted: false
		}
		condition.attributes = {exclude: ['createdAt','updatedAt','is_deleted']}

		if(data.search && data.search != null && !_.isEmpty(data.search)){
			condition.where = {[Op.or]: [{name: {[Op.like]: "%" + data.search + "%",}}],}
		} 


		var condition2 = {
			include: [
				{
					model: productModel,
					include:[
						{
							model: productCategoryModel,
							as: 'product_categorys',
							attributes:['name']
						},
						{
							model: productCategoryModel,
							as: 'sub_category',
							attributes:['name']
						}
					]
				}
			],
		}
		condition2.where = {
			user_id: data.user_id,
			is_deleted: false
		}
		condition2.attributes = {exclude: ['createdAt','updatedAt','is_deleted']}

		if(data.search && data.search != null && !_.isEmpty(data.search)){
			condition2.where = {[Op.or]: [{name: {[Op.like]: "%" + data.search + "%",}}],}
		}

		var totalRecords = null

		shoppingCartModel.findAll(condition2).then(async(CartList) => {
			totalRecords = CartList.length
		})


		shoppingCartModel.findAll(condition).then(async cartData => {

			if(cartData != null && cartData != ""){
				for(dataVal of cartData){

					if(dataVal.product != null){
						if(dataVal.product.image != null && !_.isEmpty(dataVal.product.image)){
							var product_image = await awsConfig.getSignUrl(dataVal.product.image[0]).then(function(res){
								dataVal.dataValues.product_image = res;
							})
						}else{
							dataVal.dataValues.product_image = commonConfig.default_image
						}
						
						if(dataVal.product != null){
							dataVal.dataValues.business_id = dataVal.product.business_id;
						}else{
							dataVal.dataValues.business_id = null;
						}

						if(dataVal.product != null){
							dataVal.dataValues.product_name = dataVal.product.name;
						}else{
							dataVal.dataValues.product_name = null;
						}

						if(dataVal.product.product_categorys != null){
							dataVal.dataValues.category_name = dataVal.product.product_categorys.name;
						}else{
							dataVal.dataValues.category_name = null;
						}
						if(dataVal.product.sub_category != null){
							dataVal.dataValues.sub_category_name = dataVal.product.sub_category.name;
						}else{
							dataVal.dataValues.sub_category_name = null;
						}
						
						if(dataVal.product.description != null){
		
							dataVal.dataValues.description = dataVal.product.description
						}else{
							dataVal.dataValues.description = null
						}
		
						if(dataVal.product != null){
		
							dataVal.dataValues.rating = null
						}else{
							dataVal.dataValues.rating = null
						}
						delete dataVal.dataValues.category_id
						delete dataVal.dataValues.product
					}

					// console.log(data)
					if(dataVal.product_category != null){

						dataVal.dataValues.category_name = dataVal.product_category.name
						delete dataVal.dataValues.product_category
					}else{
						dataVal.dataValues.category_name = ""
					}
					// if(data.sub_category != null){

					// 	data.dataValues.product_type = data.sub_category.name
					// 	delete data.dataValues.sub_category
					// }else{
					// 	data.dataValues.product_type = "";
					// }
				}

				const previous_page = (data.page - 1);
				const last_page = Math.ceil(totalRecords / data.page_size);
				var next_page = null;
				if(last_page > data.page){
					var pageNumber = data.page;
					pageNumber++;
					next_page = pageNumber;
				}
				
				var response = {};
				response.totalPages = (data.page_size == 0) ? 1 : Math.ceil(totalRecords/limit);
				response.currentPage = parseInt(data.page);
				response.per_page =  (data.page_size != 0) ? parseInt(data.page_size) : cartData.length;
				response.total_records = totalRecords;
				response.data = cartData;
				response.previousPage = (previous_page == 0) ? null : previous_page ;
				response.nextPage = next_page;
				response.lastPage = last_page;
				
				res.send(setRes(resCode.OK, true, 'Your cart details.',response));
			}else{
				res.send(setRes(resCode.OK, true, "Your cart is empty.",null))
			}
		}).catch(error => {
			console.log(error)
			res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.RemoveProductCart = async(req,res) => {

	var data = req.body;
	var shoppingCartModel = models.shopping_cart;
	var userModel = models.user
	var productModel = models.products

	var requiredFields = _.reject(['user_id','product_id'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
		userModel.findOne({
			where:{
				id:data.user_id,
				is_deleted:false,
				is_active:true
			}
		}).then(async user => {
			if(_.isEmpty(user)){
				res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
			}else{
				productModel.findOne({
					where:{
						id:data.product_id,
						is_deleted:false
					}
				}).then(async product => {
					if(_.isEmpty(product)){
						res.send(setRes(resCode.ResourceNotFound, false, "Product not found.",null))
					}else{
						shoppingCartModel.findOne({
							where: {
								user_id: data.user_id,product_id : data.product_id, is_deleted: false
							}
						}).then(UserCartData => {
				
							if(UserCartData != null ){
				
								shoppingCartModel.update({is_deleted:true}, {
									where: {
										user_id: data.user_id,product_id : data.product_id, is_deleted: false
									}
								}).then(UpdateData =>{
									if(UpdateData > 0){
										shoppingCartModel.findOne({
											where: {
												user_id: data.user_id, is_deleted: false
											}
										}).then(data => {
											
											res.send(setRes(resCode.OK, true, "Product remove from cart successfully.",data))
										}).catch(error => {
											
											res.send(setRes(resCode.InternalServer, false, "Fail to remove product from cart.",null))
										})
									}
									
								})
							}else{
								res.send(setRes(resCode.ResourceNotFound, false, "Shopping card not found",null))
							}
						})
					}
				})
			}
		})

		
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.QtyUpdate = async(req,res) => {

	var data = req.body;
	var shoppingCartModel = models.shopping_cart;
	var userModel = models.user
	var productModel = models.products

	var requiredFields = _.reject(['user_id','product_id','qty'], (o) => { return _.has(data, o)  })
	if(requiredFields == ""){

		userModel.findOne({
			where:{
				id:data.user_id,
				is_deleted:false,
				is_active:true
			}
		}).then(async user => {
			if(_.isEmpty(user)){
				res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
			}else{
				productModel.findOne({
					where:{
						id:data.product_id,
						is_deleted:false
					}
				}).then(async product => {
					if(_.isEmpty(product)){
						res.send(setRes(resCode.ResourceNotFound, false, "Product not found.",null))
					}else{
						shoppingCartModel.findOne({
							where: {
								user_id: data.user_id,product_id : data.product_id, is_deleted: false
							}
						}).then(UserCartData => {
							
							if(UserCartData != null){
								shoppingCartModel.update({qty:data.qty}, {
									where: {
										user_id: data.user_id,product_id : data.product_id, is_deleted: false
									}
								}).then(UpdateData =>{
									if(UpdateData > 0){
				
										shoppingCartModel.findOne({
											where: {
												user_id: data.user_id,product_id : data.product_id, is_deleted: false
											}
										}).then(data => {
											
											res.send(setRes(resCode.OK, true, "Quantity update successfully.",data))
										}).catch(error => {
											
											res.send(setRes(resCode.BadRequest, false ,"Fail to update quantity.",null))
										})
									}else{
										res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
									}
								});
							}else{
								res.send(setRes(resCode.ResourceNotFound,false,"Shopping cart not found",null))
							}
						})
					}
				})
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}