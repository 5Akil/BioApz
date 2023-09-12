var models = require('../../models')
var setRes = require('../../response')
var resCode = require('../../config/res_code_config');
const {find} = require('underscore');
var _ = require('underscore')
const pagination = require('../../helpers/pagination');
const Op = models.Op;
const notificationModel = models.notifications;
const notificationReceiverModel = models.notification_receivers;

exports.list = async (req,res) =>{
	try{
		const data = req.body;
		const authUser = req.user;
		const Op = models.Op;
		let unreadNotificationCount = 0;
		
		var requiredFields = _.reject(['page', 'page_size'], (o) => { return _.has(data, o) })
		if (_.isEmpty(requiredFields)) {
			if (data.page < 0 || data.page === 0) {
				return res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1", null))
			}
			var skip = data.page_size * (data.page - 1)
			var limit = parseInt(data.page_size)

			const condition = {
				include:[{
					model: notificationReceiverModel,
					where: {
						is_deleted:false,
						role_id:authUser.role_id,
						receiver_id: authUser.id
					},
					attributes: {exclude:['created_at','updated_at','deleted_at']}
				}],
				attributes: {exclude:['role_id','notification_type','status','updated_at','deleted_at']},
				order: [['created_at', 'DESC']],
			};
			
			condition.where = {
				notification_type:{
					[Op.ne]:'global_push_notification'
				},
			}
			
			if(data.page_size != 0 && !_.isEmpty(data.page_size)){
				condition.offset = skip,
				condition.limit = limit
			}

			const recordCount = await notificationModel.findAndCountAll(condition);
			const totalRecords = recordCount?.count;

			const unreadNotification = await notificationModel.findAndCountAll({
				include: [
				  {
					model: notificationReceiverModel,
					where: {
						is_deleted:false,
						role_id:authUser.role_id,
						receiver_id: authUser.id,
						is_read:false
					},
					attributes: {exclude:['created_at','updated_at','deleted_at']}
				  },
				],
				attributes: {exclude:['role_id','notification_type','status','created_at','updated_at','deleted_at']},
				where: condition.where, // Reuse the outer `where` condition
			});
			const notificationList = await notificationModel.findAll(condition);
			for(const data of notificationList){
				let result = JSON.parse(JSON.stringify(data));
				data.dataValues.is_read = result.notification_receivers[0].is_read;
				if (data.dataValues.is_read === false) {
					unreadNotificationCount++;
				}
				delete data.dataValues.notification_receivers;
				delete data?.dataValues?.created_at;
			}
			const valueData = {}
			valueData.unread_notifications = unreadNotification?.count || 0;
			valueData.notificationList = notificationList;
			const response = new pagination(valueData, parseInt(totalRecords), parseInt(data.page), parseInt(data.page_size));
			return res.send(setRes(resCode.OK, true, "Notifications List.", (response.getPaginationInfo())));
		}else {
			return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), true))
		}
	}catch(error){
		return res.send(setRes(resCode.BadRequest,false,"An error occurred.",null))
	}
}

exports.markAsRead = async (req,res) =>{
	try{
		const authUser = req.user;
		const data = req.body;
		const requestId = data.notification_id;
		console.log(authUser.id)
		var requiredFields = _.reject(['notification_id'], (o) => { return _.has(data, o) })
		if (_.isEmpty(requiredFields)) {

			const condition = {
				include: [
				  {
					model: notificationModel,
					where: {
						notification_type: {
							[Op.ne]: 'global_push_notification',
						},
					},
				  },
				],
				where: {
				  receiver_id: authUser.id,
				  role_id:authUser.role_id,
				  is_deleted: false,
				},
				attributes: {
				  exclude: ['created_at', 'updated_at', 'deleted_at'],
				},
			  };

			if(_.isArray(requestId) && requestId != 'all' && requestId.length == 1){
				condition.where.notification_id = requestId[0]
			}else{
				if (_.isArray(requestId)) { // Check if requestId is an array
					condition.where = {
					  ...condition.where,
					  notification_id: {
						[Op.in]: requestId,
					  },
					};
				  }
			}
			await notificationReceiverModel.update(
				{	
					is_read: true,
				},
				{
					where: condition.where
				}
			);
			const notificationMarkAsRead = await notificationReceiverModel.findAll(condition);
			if (_.isEmpty(notificationMarkAsRead)) {
				return res.send(
				setRes(resCode.ResourceNotFound, true, 'Notifications Not Found.', null)
				);
			}
			for (const notification of notificationMarkAsRead) {
				delete notification.dataValues.id;
				delete notification.dataValues.notification;
			}
			return res.send(setRes(resCode.OK, true, "Notifications Mark As Read.", notificationMarkAsRead));
		}else {
			return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), true))
		}
	}catch(error){
		console.log(error)
		return res.send(setRes(resCode.BadRequest,false,"Something Went Wrong.",null))
	}
}

exports.delete = async (req,res) =>{
	try{
		const authUser = req.user;
		const data = req.body;
		var requestId = data.notification_id;
		var requiredFields = _.reject(['notification_id'], (o) => { return _.has(data, o) })
		if (_.isEmpty(requiredFields)) {
			const condition = {
				include: [
				  {
					model: notificationModel,
					where: {
						notification_type: {
							[Op.ne]: 'global_push_notification',
						},
					},
				  },
				],
				where: {
				  receiver_id: authUser.id,
				  role_id:authUser.role_id,
				  is_deleted: false,
				},
				attributes: {
				  exclude: ['created_at', 'updated_at', 'deleted_at'],
				},
			  };

			  if(_.isArray(requestId) && requestId != 'all' && requestId.length == 1){
				condition.where.notification_id = requestId[0]
			}else{
				if (_.isArray(requestId)) { // Check if requestId is an array
					condition.where = {
					  ...condition.where,
					  notification_id: {
						[Op.in]: requestId,
					  },
					};
				  }
			}
			const notificationDelete = await notificationReceiverModel.findAll(condition);
			if (_.isEmpty(notificationDelete)) {
				return res.send(
				setRes(resCode.ResourceNotFound, true, 'Notifications Not Found.', null)
				);
			}
			await notificationReceiverModel.update(
				{
					is_deleted: true,
				},
				{
					where: condition.where
				}
			);
			for(const dataVal of notificationDelete){
				dataVal.destroy();
			}
			return res.send(setRes(resCode.OK, true, "Notifications deleted successfully.", null));
		}else {
			return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), true))
		}
	}catch(error){
		return res.send(setRes(resCode.BadRequest,false,"An error occurred.",null))
	}
}