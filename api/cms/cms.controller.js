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

exports.createCMS = async (req, res) => {

	var data = req.body
	var cmsModel = models.cms_pages
	const businessModel = models.business;
	const authUser = req.user;

	var requiredFields = _.reject(['page_key', 'page_label', 'page_value'], (o) => { return _.has(data, o)  })

	const possiblePageKey = ['about','store_info','terms_of_service', 'how_to_use'];

	if (!data?.page_key || !possiblePageKey.includes(data?.page_key)) {
		return res.send(setRes(resCode.BadRequest, false, `Possible value for page_key is one from ${possiblePageKey.join(',')}`,null));
	}

	if(requiredFields == ""){
		const blankValue = _.reject(['page_key', 'page_label', 'page_value'], (o) => { return data[o]  })
		if (blankValue != "") {
			return res.send(setRes(resCode.BadRequest, false, (blankValue.toString() + ' can not be blank'),null))
		}
		await businessModel.findOne({
			where: {id: authUser.id,is_deleted: false,is_active:true}
		}).then(async business => {
			if(business){
				await cmsModel.findOne({
					where:
					{
						page_key:data.page_key,
						business_id:authUser.id,
						is_deleted:false
					}
				}).then(async pageDetail => {
					if(pageDetail != null){
						res.send(setRes(resCode.BadRequest,false,"This page data already exist",null))
					}else{
						data.type = 'business';
						data.business_id = authUser.id;
						await cmsModel.create(data).then(async cmsData => {
							res.send(setRes(resCode.OK,true,`${cmsData.page_key} page added successfully`,cmsData))
						}).catch(error => {
							console.log(error)
							res.send(setRes(resCode.InternalServer,false,"Fail to add cms data",null))
						})
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
			}
		})

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.viewCMS = async (req , res) => {

	var data = req.body
	var page_keys = data.page_key.split(',');
	var Op = models.Op;
	var cmsModel = models.cms_pages
	var requiredFields = _.reject(['business_id','page_key'], (o) => { return _.has(data, o)  })

	const possiblePageKey = ['about','store_info','terms_of_service','how_to_use'];

	if (data?.page_key && page_keys.map((k)=> !possiblePageKey.includes(k)).filter((t)=> t === true ).length > 0 ) {
		return res.send(setRes(res.BadRequest, false, `Possible value for page_key are ${possiblePageKey.join(',')} `,null));
	}
	if(requiredFields == ""){

		await cmsModel.findAll({
			where:{
				business_id : data.business_id,
				page_key:{
					[Op.in]:page_keys
				},
				is_enable:true,
				is_deleted:false,
				type:'business'
			},
			attributes: { exclude: ['is_deleted', 'is_enable','createdAt','updatedAt','type'] }
		}).then(async pageData => {
			var page_details = {};
			if(pageData != null){
				
				for(const data of pageData){
					page_details[data.page_key] = data;
				}
				pageData = page_details
				res.send(setRes(resCode.OK,true,`Cms page get successfully`,pageData))
			}else{

				res.send(setRes(resCode.ResourceNotFound,false,'Cms page not found',null))
			}
		}).catch(error => {
			res.send(setRes(resCode.BadRequest,false,"Fail to get page details",true))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.updateCMS = async (req, res) => {

	var data = req.body
	var cmsModel = models.cms_pages

	var requiredFields = _.reject(['id','page_key','page_label', 'page_value'], (o) => { return _.has(data, o)  })
	
	const possiblePageKey = ['about','store_info','terms_of_service', 'how_to_use'];

	if (!data?.page_key || !possiblePageKey.includes(data?.page_key)) {
		return res.send(setRes(res.BadRequest, false, `Possible value for page_key is one from ${possiblePageKey.join(',')}`,null));
	}

	if(requiredFields == "") {
		const blankValue = _.reject(['id','page_key', 'page_label', 'page_value'], (o) => { return data[o]  })
		if (blankValue != "") {
			return res.send(setRes(resCode.BadRequest, false, (blankValue.toString() + ' can not be blank'),null))
		}
		await cmsModel.findOne({
			where:{
				id:data.id,
				page_key:data.page_key,
				is_deleted:false,
				is_enable:true
			}
		}).then(async pageData => {

			if(pageData != null ){

				await cmsModel.update(data,{
					where:{
						id:data.id,
						page_key:data.page_key
					}
				}).then(async updateData => {

					if(updateData == 1) {

						await cmsModel.findOne({
							where:{
								id:data.id,
								page_key:data.page_key
							}
						}).then(async pageDetails => {
							res.send(setRes(resCode.OK,true,`${pageDetails.page_key} page updated successfully`,pageDetails))
						})
					}else{
						res.send(setRes(resCode.InternalServer,false,'Internal server error',null))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,"Page not found",null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))	
	}
}