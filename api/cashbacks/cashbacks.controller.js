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

// Create Reward cashbacks START
exports.cashbackCreate = async (req, res) => {
	try {
		var data = req.body
		var cashbackModel = models.cashbacks
		var businessModel = models.business
		var categoryModel = models.product_categorys
		var productModel = models.products
		var Op = models.Op;
		var validation = true;
		var currentDate = (moment().format('YYYY-MM-DD') == moment(data.validity_for).format('YYYY-MM-DD'))
		var pastDate = moment(data.validity_for, 'YYYY-MM-DD').isBefore(moment());

		var requiredFields = _.reject(['business_id', 'title', 'cashback_on', 'cashback_type', 'cashback_value', 'validity_for'], (o) => { return _.has(data, o) })
		const result = !_.isEmpty(data.cashback_type) && data.cashback_type == 0 ? (!((data.cashback_value >= Math.min(1, 100)) && (data.cashback_value <= Math.max(1, 100))) ? true : false) : '';
		if (requiredFields == "") {
			const cashbackTitle = data?.title?.trim() || data?.title;
			if (!_.isEmpty(data.cashback_on) && data.cashback_on == 0) {
				const checkForProductFields = _.reject(['product_id'], (o) => { return _.has(data, o) });
				if (checkForProductFields != "") {
					return res.send(setRes(resCode.BadRequest,false,checkForProductFields.toString() + " are required",null));
				}
			}
			if (result) {
				return res.send(setRes(resCode.BadRequest, false, "Please select valid cashback value in percentage(between 1 to 100)!", null))
			}
			if (data.cashback_value!== undefined  && (!Number(data.cashback_value) || isNaN(data.cashback_value)) || data.cashback_value <= 0) {
				return res.send(setRes(resCode.BadRequest,false, "Cashback value should be greater than 0!",null))
			}
			if (currentDate || pastDate) {
				return res.send(setRes(resCode.BadRequest, false, "You can't select past and current date.!", null))
			}
			if (validation) {
				await businessModel.findOne({
					where: { id: data.business_id, is_deleted: false, is_active: true }
				}).then(async business => {
					if (_.isEmpty(business)) {
						res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
					} else {
						if (!_.isEmpty(data.cashback_on) && data.cashback_on == 0) {
							if(data.product_category_id && !_.isEmpty(data.product_category_id)){
								const productCategory = await categoryModel.findOne({
									where: {
										id: data.product_category_id, is_deleted: false, is_enable: true, business_id: data.business_id, parent_id: {
											[Op.eq]: 0
										}
									}
								});

								if(_.isEmpty(productCategory)){
									return res.send(setRes(resCode.ResourceNotFound, false, "Product Category not found.", null))
								}
							}
							var products = !_.isEmpty(data.product_id) ? data.product_id : '';
							var proArray = products.split(",");
							await productModel.findAll({
								where: { id: { [Op.in]: proArray }, is_deleted: false, business_id: data.business_id }
							}).then(async products => {
								if (_.isEmpty(products) || (products.length != proArray.length)) {
									return res.send(setRes(resCode.ResourceNotFound, false, "Product not found.", null))
								} else {
									await cashbackModel.findOne({
										where: {
											isDeleted: false, status: true, title: { [Op.eq]: cashbackTitle }
										}
									}).then(async cashbackData => {
										if (cashbackData) {
											return res.send(setRes(resCode.BadRequest, false, "Cashback title already taken.!", null))
										} else {
											await cashbackModel.create(data).then(async responseData => {
												if (responseData) {
													return res.send(setRes(resCode.OK, true, "Cashback added successfully", responseData))
												} else {
													return res.send(setRes(resCode.InternalServer, false, "Internal server error", null))
												}
											})
										}
									})
								}
							})
						} // If Cashback on : order type 
						else {
							const isCashbackExists = await cashbackModel.findOne({
								where: {
									isDeleted: false, status: true, title: { [Op.eq]: cashbackTitle }
								}
							})

							if (isCashbackExists) {
								return res.send(setRes(resCode.BadRequest, false, "Cashback title already taken.!", null))
							} else {
								const responseData = await cashbackModel.create(data);
								if (responseData) {
									res.send(setRes(resCode.OK, true, "Cashback added successfully", responseData))
								} else {
									res.send(setRes(resCode.InternalServer, false, "Internal server error", null))
								}
							}
						}
					}
				})
			}
		} else {
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
		}
	} catch (error) {
		res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null))
	}
}
// Create Reward cashbacks END

// Delete Reward Cashback START
exports.deleteCashback = async (req, res) => {
	try {
		var data = req.params
		var cashbackModel = models.cashbacks
		var requiredFields = _.reject(['id'], (o) => { return _.has(data, o) })

		if (requiredFields == "") {
			cashbackModel.findOne({
				where: {
					id: data.id,
					isDeleted: false
				}
			}).then(async cashbackData => {
				if (cashbackData) {
					await cashbackData.update({
						isDeleted: true,
						status: false
					}).then(async deleteData => {
						if (deleteData) {
							await cashbackModel.findOne({
								where: {
									id: deleteData.id
								}
							}).then(async Data => {
								Data.destroy();
							});
						}
					});
					res.send(setRes(resCode.OK, true, "Cashback deleted successfully", null))
				} else {
					res.send(setRes(resCode.ResourceNotFound, false, "Cashback not found", null))
				}
			}).catch(error => {
				res.send(setRes(resCode.BadRequest, false, "Fail to delete cashbackq!", null))
			})
		} else {
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
		}
	} catch (error) {
		res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null))
	}
}
// Delete Reward Cashback END

// Update Reward Cashback START
exports.cashbackUpdate = async (req, res) => {
	try {
		var data = req.body;
		var cashbackModel = models.cashbacks;
		var categoryModel = models.product_categorys;
		var productModel = models.products;
		var Op = models.Op;
		var validation = true;
		var requiredFields = _.reject(["id"], (o) => {
			return _.has(data, o);
		});
		var currentDate = (moment().format('YYYY-MM-DD') == moment(data.validity_for).format('YYYY-MM-DD'))
		var pastDate = moment(data.validity_for, 'YYYY-MM-DD').isBefore(moment());
		if (requiredFields == "") {
			const cashbackTitle = data?.title?.trim() || data?.title;
			cashbackModel
				.findOne({
					where: {
						id: data.id,
						isDeleted: false,
						status: true,
						deleted_at: null,
					},
				})
				.then(async (cashbackDetails) => {
					if (_.isEmpty(cashbackDetails)) {
						return res.send(
							setRes(
								resCode.ResourceNotFound,
								false,
								"Cashback not found.",
								null
							)
						);
					} else {
						const cashbackType = data.cashback_type ? data.cashback_type : cashbackDetails.cashback_type;
						const cashbackValue = data.cashback_value ? data.cashback_value : cashbackDetails.cashback_value;
						if (!(_.isEmpty(data.cashback_value)) ||  !(_.isEmpty(data.cashback_type))) {
							const result =
							cashbackType == 0
									? !(
										cashbackValue >= Math.min(1, 100) &&
										cashbackValue <= Math.max(1, 100)
									)
										? true
										: false
									: "";
							if (result) {
								return res.send(
									setRes(
										resCode.BadRequest,
										false,
										"Please select valid cashback value in percentage(between 1 to 100)!",
										null
									)
								);
							}
							if (cashbackValue!== undefined  && (!Number(cashbackValue) || isNaN(cashbackValue)) || cashbackValue <= 0) {
								return res.send(setRes(resCode.BadRequest,false, "Cashback value should be greater than 0!",null))
							}
						}
						if (!_.isEmpty(data.validity_for)) {
							if (currentDate || pastDate) {
								return res.send(setRes(resCode.BadRequest, false, "You can't select past and current date.!", null))
							}
						}
						await cashbackModel
							.findOne({
								where: {
									isDeleted: false,
									status: true,
									deleted_at: null,
									title: { [Op.eq]: cashbackTitle },
									id: { [Op.ne]: data.id },
								},
							})
							.then(async (cashbackData) => {
								if (cashbackData == null) {
									await cashbackModel
										.update(data, {
											where: {
												id: data.id,
												isDeleted: false,
												status: true,
												deleted_at: null,
											},
										})
										.then(async (updateData) => {
											if (updateData) {
												await cashbackModel
													.findOne({ where: { id: data.id },
														include: [
														{
															model: categoryModel,
															attributes: ['id', 'name']
														}
													], })
													.then(async (data) => {
														const products = await productModel.findAll({ where: { id: { [Op.in] : data.product_id?.split(',') || [] } } ,attributes: ["name"], raw: true});
														const product_name_arr = products?.map(val => val.name);
														const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
														data.dataValues.type = "cashbacks";
														data.dataValues.value_type = data.cashback_type;
														data.dataValues.amount = data.cashback_value;
														if(data.validity_for < moment().format('YYYY-MM-DD')){
															data.dataValues.is_expired = true;
														}else{
															data.dataValues.is_expired = false;
														}
														data.dataValues.product_category_name = data?.product_category?.name || '';
														data.dataValues.product_name = product_name.trim();
														delete data.dataValues.product_category;
														res.send(
															setRes(
																resCode.OK,
																true,
																"Cashback update successfully",
																data
															)
														);
													});
											} else {
												res.send(
													setRes(
														resCode.BadRequest,
														false,
														"Fail to update cashback.",
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
											"Cashback title already taken.!",
											null
										)
									);
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
	} catch (error) {
		res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null));
	}
};
// Update REward Cashback END