var models = require('../../models')
var resCode = require('../../config/res_code_config')
var setRes = require('../../response')
var _ = require('underscore')
var Op = models.Op;

exports.deviceToken = async (req, res) => {
	try{
		const data = req.body;
		const authData = req.user;
		const device = models.device_tokens;
		var authModel = (authData.role_id == 3 && authData.role_id != 2) ? models.business : models.user;
		//var requiredFields = _.reject(['device_id','device_type','device_token'], (o) => { return _.has(data, o) })
		//if (requiredFields == '') {
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
			const alreadyLoggedInUser = await device.findOne(condition);
			//if(alreadyLoggedInUser){
			//	alreadyLoggedInUser.update({device_token:data.device_token});
			//	return res.send(setRes(resCode.OK, true, "Device Token Updated Successfully", alreadyLoggedInUser))
			//}else{
			//	const deviceData = {
			//		device_id: data.device_id,
			//		device_type: (data.device_type == 1) ? 'ios' : 'android',
			//		device_token: data.device_token,
			//		api_version: (data.api_version == 1) ? 'production' : 'testing',
			//		os_version: (data.os_version == undefined || _.isEmpty(data.os_version)) ? null : data.os_version,
			//		app_version: (data.app_version == undefined || _.isEmpty(data.app_version)) ? null : data.app_version,
			//		device_name: (data.device_name == undefined || _.isEmpty(data.device_name)) ? null : data.device_name,
			//		model_name: (data.model_name == undefined || _.isEmpty(data.model_name)) ? null : data.model_name,
			//	}
			//	if(role_id === 2){
			//		deviceData.user_id = id;
			//	}else{
			//		deviceData.business_id = id;
			//	}
			//	const storedevicetToken = await device.create(deviceData)
			//	if(storedevicetToken){
			//		return res.send(setRes(resCode.OK, true, "Device Registered Successfully", storedevicetToken))
			//	}
			//}
		//} else {
		//	res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
		//}
	}catch(error){
		return res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}