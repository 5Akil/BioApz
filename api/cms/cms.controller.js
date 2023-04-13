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

exports.AddCms = async (req, res) => {

	var data = req.body
	var cmsModel = models.cms_pages

	var requiredFields = _.reject(['business_id','page_key', 'page_label', 'page_value'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		cmsModel.findOne({
			where:
			{
				page_key:data.page_key,
				business_id:data.business_id
			}
		}).then(pageDetail => {

			if(pageDetail != null){
				res.send(setRes(resCode.BadRequest,null,false,"This page data already exsit"))
			}else{

				cmsModel.create(data).then(cmsData => {
					res.send(setRes(resCode.OK,data,false,"Data added successfully"))
				}).catch(error => {
					res.send(setRes(resCode.InternalServer,null,true,"Fail to add cms data"))
				})
			}
		})

	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}

exports.GetPageDetails = async (req , res) => {

	var data = req.body
	var page_keys = data.page_key.split(',');
	var Op = models.Op;
	var cmsModel = models.cms_pages
	var requiredFields = _.reject(['business_id','page_key'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		cmsModel.findAll({
			where:{
				business_id : data.business_id,
				page_key:{
					[Op.in]:page_keys
				},
				is_enable:true,
				is_deleted:false
			},
			attributes: { exclude: ['is_deleted', 'is_enable'] }
		}).then(pageData => {
			var page_details = {};
			if(pageData != null){
				
				for(const data of pageData){
					page_details[data.page_key] = data;
				}
				pageData = page_details
				res.send(setRes(resCode.OK,pageData,false,'Data get successfully'))
			}else{

				res.send(setRes(resCode.ResourceNotFound,null,false,'Data not found'))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,null,true,"Fail to get page details"))
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}

exports.UpdatePageData = async (req, res) => {

	var data = req.body
	var cmsModel = models.cms_pages

	var requiredFields = _.reject(['id','page_key'], (o) => { return _.has(data, o)  })

	if(requiredFields == "") {

		cmsModel.findOne({
			where:{
				id:data.id,
				page_key:data.page_key,
				is_deleted:false,
				is_enable:true
			}
		}).then(pageData => {

			if(pageData != null ){

				cmsModel.update(data,{
					where:{
						id:data.id,
						page_key:data.page_key
					}
				}).then(updateData => {

					if(updateData == 1) {

						cmsModel.findOne({
							where:{
								id:data.id,
								page_key:data.page_key
							}
						}).then(pageDetails => {
							res.send(setRes(resCode.OK,pageDetails,false,'Page data update successfully'))
						})
					}else{
						res.send(setRes(resCode.InternalServer,null,true,'Internal server error'))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound,null,false,"Page not found"))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,null,false,"Internal server error"))
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))	
	}
}