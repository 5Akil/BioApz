var mongoose = require('mongoose')
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
var moment = require('moment')
const Sequelize = require('sequelize');
var notification = require('../../push_notification')
var awsConfig = require('../../config/aws_S3_config')
const fs = require('fs');
var multer = require('multer');
const multerS3 = require('multer-s3');

// Create Reward discounts START
exports.create = async (req,res) => {
	try {
		var data = req.body
		var discountModel = models.discounts
		var businessModel = models.business
		var categoryModel = models.product_categorys
		var productModel = models.products
		var Op = models.Op;
		var validation = true;

		var currentDate = (moment().format('YYYY-MM-DD') == moment(data.validity_for).format('YYYY-MM-DD'))
		var pastDate = moment(data.validity_for,'YYYY-MM-DD').isBefore(moment());

		if(!_.isEmpty(data.validity_for)) {
			if(currentDate || pastDate) {
				return res.send(setRes(resCode.BadRequest,false,"You can't select past and current date.!",null))
			}
		}

		var requiredFields = _.reject(['business_id','title','discount_type','discount_value','product_id','validity_for'],(o) => {return _.has(data,o)})
		const result = data.discount_type == 0 ? (!((data.discount_value >= Math.min(1,100)) && (data.discount_value <= Math.max(1,100))) ? true : false) : '';
		if(data.discount_value !== undefined && (!Number(data.discount_value) || isNaN(data.discount_value)) || data.discount_value <= 0) {
			validation = false;
			return res.send(setRes(resCode.BadRequest,false,"Discount value should be greater than 0!",null))
		}
		if(requiredFields == "") {
			const discountTitle = data?.title?.trim() || data.title;

			if(result) {
				return res.send(setRes(resCode.BadRequest,false,"Please select valid discount value in percentage(between 1 to 100)!",null))
			} else {
				if(validation) {
					await businessModel.findOne({
						where: {id: data.business_id,is_deleted: false,is_active: true}
					}).then(async business => {
						if(_.isEmpty(business)) {
							return res.send(setRes(resCode.ResourceNotFound,false,"Business not found.",null))
						} else {
							if(data.product_category_id) {
								var productCategory = await categoryModel.findOne({
									where: {id: data.product_category_id,is_deleted: false,is_enable: true,business_id: data.business_id}
								});
								if(_.isEmpty(productCategory)) {
									return res.send(setRes(resCode.ResourceNotFound,false,"Product Category not found.",null))
								}
							}

							var products = !_.isEmpty(data.product_id) ? data.product_id : '';
							var proArray = products.split(",");
							await productModel.findAll({
								where: {id: {[Op.in]: proArray},is_deleted: false,business_id: data.business_id},
								order: [['price','ASC']],
							}).then(async products => {
								if(_.isEmpty(products) || (products.length != proArray.length)) {
									return res.send(setRes(resCode.ResourceNotFound,false,"Product not found.",null))
								} else {
									var discountAmount = products[0].price * data.discount_value / 100;
									if((data.discount_type == true && data.discount_value > products[0].price) || (data.discount_type == false && discountAmount > products[0].price)) {
										return res.send(setRes(resCode.BadRequest,false,"Please enter decount value less then selected products min value!",null))
									} else {
										await discountModel.findOne({
											where: {
												isDeleted: false,status: true,title: {[Op.eq]: discountTitle}
											}
										}).then(async cashbackData => {
											if(cashbackData) {
												return res.send(setRes(resCode.BadRequest,false,"Discount title already taken.!",null))
											} else {
												await discountModel.create(data).then(async responseData => {
													if(responseData) {
														return res.send(setRes(resCode.OK,true,"Discount added successfully",responseData))
													} else {
														return res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
													}
												})
											}
										})
									}
								}
							})

						}
					})
				}
			}
		} else {
			return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		console.log(error)
		return res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}
// Create Reward discounts END

// Delete Reward discount START
exports.delete = async (req,res) => {
	try {
		var data = req.params
		var discountModel = models.discounts
		var requiredFields = _.reject(['id'],(o) => {return _.has(data,o)})
		if(requiredFields == "") {
			discountModel.findOne(
				{
					where: {id: data.id,isDeleted: false,deleted_at: null}
				}).then(async discountData => {
					if(discountData) {
						await discountData.update({
							isDeleted: true,
							status: false
						}).then(async deleteData => {
							if(deleteData) {
								await discountModel.findOne({
									where: {
										id: deleteData.id
									}
								}).then(async Data => {
									Data.destroy();
								});
							}
						});
						return res.send(setRes(resCode.OK,true,"Discount deleted successfully",null))
					} else {
						return res.send(setRes(resCode.ResourceNotFound,false,"Discount not found",null))
					}
				}).catch(error => {
					return res.send(setRes(resCode.BadRequest,false,error,null))
				})
		} else {
			return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		return res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}
// Delete Reward discount END

// Update Reward discount START
exports.update = async (req,res) => {
	try {
		var data = req.body
		var discountModel = models.discounts
		var businessModel = models.business
		var categoryModel = models.product_categorys
		var productModel = models.products
		var Op = models.Op;
		var validation = true;
		var currentDate = (moment().format('YYYY-MM-DD') == moment(data.validity_for).format('YYYY-MM-DD'))
		var pastDate = moment(data.validity_for,'YYYY-MM-DD').isBefore(moment());

		if(!_.isEmpty(data.validity_for)) {
			if(currentDate || pastDate) {
				validation = false;
				return res.send(setRes(resCode.BadRequest,false,"You can't select past and current date.!",null))
			}
		}

		var requiredFields = _.reject(['id','title','discount_type','discount_value','product_id','validity_for'],(o) => {return _.has(data,o)})
		const result = data.discount_type == 0 ? (!((data.discount_value >= Math.min(1,100)) && (data.discount_value <= Math.max(1,100))) ? true : false) : '';
		if(requiredFields == "") {
			const discountTitle = data?.title?.trim() || data.title;
			if(result) {
				validation = false;
				return res.send(setRes(resCode.BadRequest,false,"Please select valid cashback value in percentage(between 1 to 100)!",null))
			}
			if(data.discount_value !== undefined && (!Number(data.discount_value) || isNaN(data.discount_value)) || data.discount_value <= 0) {
				validation = false;
				return res.send(setRes(resCode.BadRequest,false,"Discount value should be greater than 0!",null))
			}
			if(validation) {
				await discountModel.findOne({
					where: {id: data.id,isDeleted: false,status: true,deleted_at: null}
				}).then(async discountDetails => {
					if(_.isEmpty(discountDetails)) {
						return res.send(setRes(resCode.ResourceNotFound,false,"Discount not found.",null))
					} else {
						await discountModel.findOne({
							where: {isDeleted: false,status: true,deleted_at: null,title: {[Op.eq]: discountTitle},id: {[Op.ne]: data.id}}
						}).then(async discountData => {
							if(discountData == null) {
								if(data.product_category_id) {
									var productCategory = await categoryModel.findOne({
										where: {id: data.product_category_id,is_deleted: false,is_enable: true}
									});
									if(_.isEmpty(productCategory)) {
										return res.send(setRes(resCode.ResourceNotFound,false,"Product Category not found.",null))
									}
								}
								await productModel.findOne({
									where: {id: data.product_id,is_deleted: false}
								}).then(async products => {
									if(_.isEmpty(products)) {
										return res.send(setRes(resCode.ResourceNotFound,false,"Product not found.",null))
									} else {
										var discountAmount = products.price * data.discount_value / 100;
										if((data.discount_type == true && data.discount_value > products.price) || (data.discount_type == false && discountAmount > products.price)) {
											return res.send(setRes(resCode.BadRequest,false,"Please enter decount value less then selected products min value!",null))
										} else {
											await discountModel.update(data,
												{
													where: {id: data.id,isDeleted: false,status: true,deleted_at: null}
												}).then(async updateData => {
													if(updateData) {
														await discountModel.findOne({
															where: {id: data.id},include: [
																{
																	model: categoryModel,
																	attributes: ['id','name']
																}
															],
														}).then(async data => {
															const products = await productModel.findAll({where: {id: {[Op.in]: data.product_id?.split(',') || []}},attributes: ["name"],raw: true});
															const product_name_arr = products?.map(val => val.name);
															const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
															data.dataValues.type = "discounts";
															data.dataValues.value_type = data.discount_type;
															data.dataValues.amount = data.discount_value;
															if(data.validity_for < moment().format('YYYY-MM-DD')) {
																data.dataValues.is_expired = true;
															} else {
																data.dataValues.is_expired = false;
															}
															data.dataValues.product_category_name = data?.product_category?.name || '';
															data.dataValues.product_name = product_name.trim();
															delete data.dataValues.product_category;
															return res.send(setRes(resCode.OK,true,'Discount update successfully',data))
														})
													} else {
														return res.send(setRes(resCode.BadRequest,false,"Fail to update discount.",null))
													}
												})
										}

									}
								})
							} else {
								return res.send(setRes(resCode.BadRequest),false,"Discount title already taken.!",null)
							}
						})
					}
				})
			}
		} else {
			return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		console.log(error)
		return res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}
// Update Reward discount START