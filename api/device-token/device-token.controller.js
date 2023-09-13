var models = require('../../models')
var resCode = require('../../config/res_code_config')
var setRes = require('../../response')
var _ = require('underscore')
var Op = models.Op;

exports.deviceToken = async (req, res) => {
	try{
		var data = req.body;
		var authData = req.user;
		var device = models.device_tokens;
		var device_version = (data.api_version == 1) ? 'production' : 'testing';
		var device_data = (data.device_type == 1) ? 'ios' : 'android';
		var authModel = (authData.role_id == 3 && authData.role_id != 2) ? models.business : models.user;
		var requiredFields = _.reject(['device_id','device_type','device_token'], (o) => { return _.has(data, o) })
		if (requiredFields == '') {
			var condition = {};
			
			condition.where = {status:{
				[Op.in]:[1]
			}}
			if(authData.role_id == 3){
				condition.where = {...condition.where,...{business_id:authData.id}}
			}
			if(authData.role_id == 2){
				condition.where = {...condition.where,...{user_id:authData.id}}
			}
			const alreadyLoggedInUser = await device.findAll(condition);
			for(const loguser of alreadyLoggedInUser){
				loguser.destroy();
				loguser.update({status:9});
			}
			//if(alreadyLoggedInUser){
			//	alreadyLoggedInUser.update(data);
			//	return res.send(setRes(resCode.OK, true, "Device Token Updated Successfully", alreadyLoggedInUser))
			//}
			//else{
				const deviceData = {
					device_id: data.device_id,
					device_type: device_data,
					device_token: data.device_token,
					api_version: device_version,
					os_version: (data.os_version == undefined || _.isEmpty(data.os_version)) ? null : data.os_version,
					app_version: (data.app_version == undefined || _.isEmpty(data.app_version)) ? null : data.app_version,
					device_name: (data.device_name == undefined || _.isEmpty(data.device_name)) ? null : data.device_name,
					model_name: (data.model_name == undefined || _.isEmpty(data.model_name)) ? null : data.model_name,
				}
				if(authData.role_id === 2){
					deviceData.user_id = authData.id;
				}else{
					deviceData.business_id = authData.id;
				}
				const storedevicetToken = await device.create(deviceData)
				if(storedevicetToken){
					return res.send(setRes(resCode.OK, true, "Device Registered Successfully", storedevicetToken))
				}
			//}
		} else {
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
		}
	}catch(error){
		return res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}