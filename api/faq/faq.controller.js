var async = require('async')
var resCode = require('../../config/res_code_config')
var setRes = require('../../response')
var models = require('../../models')
var _ = require('underscore')
const Sequelize = require('sequelize');
var notification = require('../../push_notification')
var moment = require('moment')
const MomentRange = require('moment-range');
const Moment = MomentRange.extendMoment(moment);
var fs = require('fs');
var awsConfig = require('../../config/aws_S3_config');
const pagination = require('../../helpers/pagination');

exports.StoreFaq = async(req, res) => {
	try{
		var data = req.body
		var faqModel = models.faqs

		var requiredFields = _.reject(['title', 'description'], (o) => { return _.has(data, o)  })
		const businessModel = models.business;
		const authUser = req.user;
		
		if(requiredFields == ""){
			
			await businessModel.findOne({
				where: {id: authUser?.id,is_deleted: false,is_active:true}
			}).then(async business => {
				if(business){
					data.business_id = authUser?.id;
					data.type = 'business';
					await faqModel.create(data).then(faqData => {
						res.send(setRes(resCode.OK,true,"FAQ added successfully.",faqData))
					}).catch(error => {
						res.send(setRes(resCode.BadRequest,false,"Fail to add FAQ.",null))
					})
				}else{
					res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
				}
			})
			
		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		return res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

exports.GetFaqList = async(req, res ) => {
	try{
		var data = req.body;
		var faqModel = models.faqs;
		var auth = req.user;

		let arrayFields = ['page', 'page_size','type'];
		const result =  (data.type == 1) ? (arrayFields.push('business_id')) : '';

		var requiredFields = _.reject(arrayFields, (o) => { return _.has(data, o)  });

		if(requiredFields == ""){
			if(data.page < 0 || data.page === 0) {
				return res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1.",null))
			}
			if(_.isEmpty(data.business_id) && (data.business_id)){
				return res.send(setRes(resCode.BadRequest, false, "Please enter business_id.",null))
			}
			var skip = data.page_size * (data.page - 1)
			var limit = parseInt(data.page_size)
			const type = (data.type == 0) ? 'admin' : 'business';
			const condition = {
				where:{
					is_deleted:false,
					type:type,
				},
				order: [
					['createdAt', 'DESC']
				]
			}

			if(!_.isEmpty(data.business_id)){
				condition.where = {...condition.where,...{business_id:data.business_id}}
			}

			if(data.page_size != 0 && !_.isEmpty(data.page_size)){
				condition.offset = skip,
				condition.limit = limit
			}
			const recordCount = await faqModel.findAndCountAll(condition);
			const totalRecords = recordCount?.count;
			await faqModel.findAll(condition).then(async faqData => {
				const response = new pagination(faqData, parseInt(totalRecords), parseInt(data.page), parseInt(data.page_size));
				return res.send(setRes(resCode.OK,true,"FAQ get successfully.",(response.getPaginationInfo())))
			}).catch(error => {
				return res.send(setRes(resCode.BadRequest,false,"Fail to get FAQ.",null))
			})
		}else{
			return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required.'),null))	
		}
	}catch(error){
		return res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

exports.GetFaqById = async (req,res) => {
	try{
	var data = req.params
	var faqModel = models.faqs

		await faqModel.findOne({
			where:{
				id:data.id,
				is_deleted:false
			}
		}).then(async faqData => {
			if(faqData != null){
				return res.send(setRes(resCode.OK,true,"FAQ get successfully.",faqData))
			}else{
				return res.send(setRes(resCode.ResourceNotFound,false,"FAQ not found.",null))
			}
		}).catch(error => {
			return res.send(setRes(resCode.BadRequest,false,"Fail to get FAQ.",null))
		})
	}catch(error){
		return res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

exports.UpdateFaq = async (req, res ) => {
	try{
		var data = req.body
		var faqModel = models.faqs
		const authUser = req.user;

		var requiredFields = _.reject(['id', 'title', 'description'], (o) => { return _.has(data, o)  })

		const faqExists = await faqModel.findOne({
			where:{
				business_id : authUser?.id,
				id:data.id,
				is_deleted:false,
				type:'business'
			}
		})
		if (!faqExists) {
			return res.send(setRes(resCode.BadRequest,false,"Invalid business user to update FAQ for Business.",null))
		}

		if(requiredFields == ""){

			await faqModel.findOne({
				where:{
					id:data.id,
					is_deleted:false
				}
			}).then(async faqData => {

				if(faqData != null){

					await faqModel.update(data,{
						where:{
							id:data.id,
							is_deleted:false
						}
					}).then(async updateData => {

						if(updateData == 1){
							await faqModel.findOne({
								where:{
									id:data.id,
									is_deleted:false
								}
							}).then(async faqDetail => {
								return res.send(setRes(resCode.OK,true,"FAQ update successfully.",faqDetail))
							})
						}else{
							return res.send(setRes(resCode.BadRequest,false,'Fail to update FAQ.',null))
						}
					})
				}else{
					return res.send(setRes(resCode.ResourceNotFound,false,"FAQ not found.",null))
				}
			}).catch(error => {
				return res.send(setRes(resCode.InternalServer,false,'Internal server error.',null))
			})
		}else{
			return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))	
		}
	}catch(error){
		return res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

exports.RemoveFaq = async (req, res ) => {
	try{
		var data = req.params
		var faqModel = models.faqs
		const authUser = req.user;

		await faqModel.findOne({
			where:{
				business_id : authUser?.id,
				id:data.id,
				is_deleted:false,
				type:'business'
			}
		}).then(async faqData => {

			if(faqData != null){

				await faqData.update({is_deleted:true})
				return res.send(setRes(resCode.OK,true,"FAQ deleted successfully.",null))
			}else{
				return res.send(setRes(resCode.ResourceNotFound,false,"FAQ not found.",null))
			}
		}).catch(error => {
			return res.send(setRes(resCode.BadRequest,false,"Fail to delete FAQ.",null))
		})
	}catch(error){
		return res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}