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
const Sequelize = require('sequelize');
var notification = require('../../push_notification')
var moment = require('moment')
const MomentRange = require('moment-range');
const Moment = MomentRange.extendMoment(moment);
var fs = require('fs');
var awsConfig = require('../../config/aws_S3_config');
const {auth} = require('firebase-admin')

exports.createCMS = async (req,res) => {
	try {
		var data = req.body
		var cmsModel = models.cms_pages
		const businessModel = models.business;
		const authUser = req.user;

		var requiredFields = _.reject(['page_key','page_label','page_value'],(o) => {return _.has(data,o)})

		//const possiblePageKey = ['about','store_info','terms_of_service', 'how_to_use'];

		//if (!data?.page_key || !possiblePageKey.includes(data?.page_key)) {
		//	return res.send(setRes(resCode.BadRequest, false, `Possible value for page_key is one from ${possiblePageKey.join(',')}`,null));
		//}

		if(requiredFields == "") {
			const blankValue = _.reject(['page_key','page_label','page_value'],(o) => {return data[o]})
			if(blankValue != "") {
				return res.send(setRes(resCode.BadRequest,false,(blankValue.toString() + ' can not be blank'),null))
			}
			await businessModel.findOne({
				where: {id: authUser.id,is_deleted: false,is_active: true}
			}).then(async business => {
				if(business) {
					await cmsModel.findOne({
						where:
						{
							page_key: data.page_key,
							business_id: authUser.id,
							is_deleted: false
						}
					}).then(async pageDetail => {
						if(pageDetail != null) {
							return res.send(setRes(resCode.BadRequest,false,"This page data already exist",null))
						} else {
							data.type = 'business';
							data.business_id = authUser.id;
							data.page_key = data.page_key.toLowerCase();
							await cmsModel.create(data).then(async cmsData => {
								return res.send(setRes(resCode.OK,true,'Store data added successfully',cmsData))
							}).catch(error => {
								return res.send(setRes(resCode.InternalServer,false,"Fail to add cms data",null))
							})
						}
					})
				} else {
					return res.send(setRes(resCode.ResourceNotFound,false,"Business not found.",null))
				}
			})

		} else {
			return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		return res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}

exports.viewCMS = async (req,res) => {
	try {
		var data = req.body
		//var page_keys = data.page_key.split(',');
		var Op = models.Op;
		var cmsModel = models.cms_pages;
		var type = (data.type == 0) ? 'admin' : 'business';

		var requiredFields = _.reject(['type'],(o) => {return _.has(data,o)})


		let arrayFields = ['type'];
		const result = (data.type == 1) ? (arrayFields.push('business_id')) : '';

		var requiredFields = _.reject(arrayFields,(o) => {return _.has(data,o)});
		//const possiblePageKey = [];
		//if(data.type == 0){
		//	possiblePageKey.push('about','privacy_policy','terms_of_service');
		//}else{
		//	possiblePageKey.push('about','store_info','terms_of_service','how_to_use');
		//}

		//if (data?.page_key && page_keys.map((k)=> !possiblePageKey.includes(k)).filter((t)=> t === true ).length > 0 ) {
		//	return res.send(setRes(res.BadRequest, false, `Possible value for page_key are ${possiblePageKey.join(',')} `,null));
		//}
		if(requiredFields == "") {
			var condition = {
				attributes: {exclude: ['createdAt','updatedAt']}
			}
			condition.where = {
				//page_key:{
				//	[Op.in]:page_keys
				//},
				//id:data.id,
				is_enable: true,
				is_deleted: false,
			}
			if(type == 'admin') {
				condition.where = {...condition.where,...{business_id: null}}
			}
			if(!_.isEmpty(data.type)) {
				condition.where = {...condition.where,...{type: type}}
			}
			if(!_.isEmpty(data.business_id)) {
				condition.where = {...condition.where,...{business_id: data.business_id}}
			}
			if(!_.isEmpty(data.page_key)) {
				condition.where = {...condition.where,...{page_key: data.page_key}}
			}
			if(!_.isEmpty(data.id)) {
				condition.where = {...condition.where,...{id: data.id}}
			}
			await cmsModel.findAll(condition).then(async pageData => {
				if(pageData != null) {
					for(const data of pageData) {
						if(type == 'admin') {
							data.dataValues.page_url = commonConfig.admin_url + data.page_key;
						}
					}
					if(pageData.length == 0) {
						return res.send(setRes(resCode.ResourceNotFound,true,`Cms page Not Found`,null))
					} else {
						return res.send(setRes(resCode.OK,true,`Cms page get successfully`,pageData))
					}
				} else {
					return res.send(setRes(resCode.ResourceNotFound,false,'Cms page not found',null))
				}
			}).catch(error => {
				return res.send(setRes(resCode.BadRequest,false,"Fail to get page details",true))
			})
		} else {
			return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		return res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}

exports.updateCMS = async (req,res) => {
	try {
		var data = req.body
		var cmsModel = models.cms_pages

		var requiredFields = _.reject(['id','page_key','page_label','page_value'],(o) => {return _.has(data,o)})

		//const possiblePageKey = ['about','store_info','terms_of_service', 'how_to_use'];

		//if (!data?.page_key || !possiblePageKey.includes(data?.page_key)) {
		//	return res.send(setRes(res.BadRequest, false, `Possible value for page_key is one from ${possiblePageKey.join(',')}`,null));
		//}

		if(requiredFields == "") {
			const blankValue = _.reject(['id','page_key','page_label','page_value'],(o) => {return data[o]})
			if(blankValue != "") {
				return res.send(setRes(resCode.BadRequest,false,(blankValue.toString() + ' can not be blank'),null))
			}
			await cmsModel.findOne({
				where: {
					id: data.id,
					page_key: data.page_key,
					is_deleted: false,
					is_enable: true
				}
			}).then(async pageData => {

				if(pageData != null) {
					if(data.page_key) {
						data.page_key = data.page_key.toLowerCase();
					}
					await cmsModel.update(data,{
						where: {
							id: data.id,
							page_key: data.page_key
						}
					}).then(async updateData => {

						if(updateData == 1) {

							await cmsModel.findOne({
								where: {
									id: data.id,
									page_key: data.page_key
								}
							}).then(async pageDetails => {
								return res.send(setRes(resCode.OK,true,'Store data updated successfully',pageDetails))
							})
						} else {
							return res.send(setRes(resCode.InternalServer,false,'Internal server error',null))
						}
					})
				} else {
					return res.send(setRes(resCode.ResourceNotFound,false,"Page not found",null))
				}
			}).catch(error => {
				return res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
			})
		} else {
			return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		return res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}