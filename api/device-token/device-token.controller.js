var models = require('../../models')
var resCode = require('../../config/res_code_config')
var setRes = require('../../response')

exports.deviceToken = async (req, res) => {
	try{
		const data = req.body;
		const {role_id,id} = req.user;
		const device = models.device_tokens;
		const deviceData = {
			device_id: data.device_id,
			device_type: (data.device_type == 1) ? 'ios' : 'android',
			device_token: data.device_token,
			api_version: (data.api_version == 1) ? 'production' : 'testing',
			os_version: (data.os_version == undefined || _.isEmpty(data.os_version)) ? null : data.os_version,
			app_version: (data.app_version == undefined || _.isEmpty(data.app_version)) ? null : data.app_version,
			device_name: (data.device_name == undefined || _.isEmpty(data.device_name)) ? null : data.device_name,
			model_name: (data.model_name == undefined || _.isEmpty(data.model_name)) ? null : data.model_name,
		}
		if(role_id === 2){
			deviceData.user_id = id;
		}else{
			deviceData.business_id = id;
		}
		const storedevicetToken = await device.create(deviceData)
		if(storedevicetToken){
			return res.send(setRes(resCode.OK, true, "Device token added successfully", storedevicetToken))
		}
	}catch(error){
		return res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}