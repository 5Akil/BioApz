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

	var data = req.body
	var faqModel = models.faqs

	var requiredFields = _.reject(['title', 'description'], (o) => { return _.has(data, o)  })
	const businessModel = models.business;
	const authUser = req.user;
	
	if(requiredFields == ""){
		
		businessModel.findOne({
			where: {id: authUser?.id,is_deleted: false,is_active:true}
		}).then(async business => {
			if(business){
				data.business_id = authUser?.id;
				faqModel.create(data).then(faqData => {
					res.send(setRes(resCode.OK,true,"FAQ added successfully.",data))
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
}

exports.GetFaqList = async(req, res ) => {

	var data = req.body
	var faqModel = models.faqs

	var requiredFields = _.reject(['business_id', 'page', 'page_size'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1.",null))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)

		const condition = {
			where:{
				business_id:data.business_id,
				is_deleted:false
			},
			order: [
				['createdAt', 'DESC']
			]
		}

		if(data.page_size != 0 && !_.isEmpty(data.page_size)){
			condition.offset = skip,
			condition.limit = limit
		}
		const recordCount = await faqModel.findAndCountAll(condition);
        const totalRecords = recordCount?.count;
		await faqModel.findAll(condition).then(async faqData => {
			const response = new pagination(faqData, parseInt(totalRecords), parseInt(data.page), parseInt(data.page_size));
			res.send(setRes(resCode.OK,true,"FAQ get successfully.",(response.getPaginationInfo())))
		}).catch(error => {
			res.send(setRes(resCode.BadRequest,false,"Fail to get FAQ.",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required.'),null))	
	}

}

exports.GetFaqById = async (req,res) => {

	var data = req.params
	var faqModel = models.faqs

	faqModel.findOne({
		where:{
			id:data.id,
			is_deleted:false
		}
	}).then(faqData => {
		if(faqData != null){
			res.send(setRes(resCode.OK,true,"FAQ get successfully.",faqData))
		}else{
			res.send(setRes(resCode.ResourceNotFound,false,"FAQ not found.",null))
		}
	}).catch(error => {
		res.send(setRes(resCode.BadRequest,false,"Fail to get FAQ.",null))
	})
}

exports.UpdateFaq = async (req, res ) => {

	var data = req.body
	var faqModel = models.faqs
	const authUser = req.user;

	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })

	const faqExists = await faqModel.findOne({
		where:{
			business_id : authUser?.id,
			id:data.id,
			is_deleted:false
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
							res.send(setRes(resCode.OK,true,"FAQ update successfully.",faqDetail))
						})
					}else{
						res.send(setRes(resCode.BadRequest,false,'Fail to update FAQ.',null))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,"FAQ not found.",null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,false,'Internal server error.',null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))	
	}

}

exports.RemoveFaq = async (req, res ) => {

	var data = req.params
	var faqModel = models.faqs
	const authUser = req.user;

	await faqModel.findOne({
		where:{
			business_id : authUser?.id,
			id:data.id,
			is_deleted:false
		}
	}).then(async faqData => {

		if(faqData != null){

			await faqData.update({is_deleted:true})
			res.send(setRes(resCode.OK,true,"FAQ deleted successfully.",null))
		}else{
			res.send(setRes(resCode.ResourceNotFound,false,"FAQ not found.",null))
		}
	}).catch(error => {
		res.send(setRes(resCode.BadRequest,false,"Fail to delete FAQ.",null))
	})
}