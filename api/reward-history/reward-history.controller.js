const models = require('../../models');
const pagination = require('../../helpers/pagination');
const setRes = require('../../response')
const resCode = require('../../config/res_code_config');
const _ = require('underscore')

exports.rewardHistoryList = async (req, res) => {
    const data = req.body;
    
    const rewardHistoryModel = models.reward_history;
    const orderModel = models.orders;
    const userGiftCardsModel = models.user_giftcards;
    const giftCardsModel = models.gift_cards;

    const discountsModel = models.discounts;
    const cashbacksModel = models.cashbacks;
    const couponesModel = models.coupones;
    const loyaltyPointsModel = models.loyalty_points;

    const Op = models.Op;

    const requiredFields = _.reject(['page','page_size','type', 'user_id'], (o) => { return _.has(data, o) })
	
    if (requiredFields == '') {
        const blankFields = _.reject(['page','page_size','type', 'user_id'], (o) => { return data[o] });
        if (blankFields != "") {
			return res.send(setRes(resCode.BadRequest, false, (blankValue.toString() + ' can not be blank'),null))
		}

        const possibleTypeValue = ['rewards','loyalty_points'];
        if (!data?.type || !possibleTypeValue.includes(data?.type)) {
            return res.send(setRes(resCode.BadRequest, false, `Possible value for type is one from ${possibleTypeValue.join(',')}`,null));
        }

        const condition = {
            include: [
                {
                    model: orderModel,
                    attributes: ["user_id", "business_id", "order_no", "amount"],
                    where: {
                        user_id: data.user_id
                    },
                    required: true,
                }
            ],
            attributes: { exclude:["deleted_at","updatedAt"]},
            order: [
                ["createdAt","DESC"]
            ]
        };
        condition.where = data.type == 'loyalty_points' ? {
            reference_reward_type: data.type
        } : {
            reference_reward_type: {
                [Op.ne] : 'loyalty_points'
            }
        };
        const rewardHistoryData = await rewardHistoryModel.findAndCountAll(condition)
        const responseArr = [];
        if (rewardHistoryData?.rows && rewardHistoryData?.rows.length > 0) {
            for (let rewardHistory of rewardHistoryData?.rows) {
                if (rewardHistory.reference_reward_type == 'gift_cards') {

                    let rewardDetailsObj = await userGiftCardsModel.findOne({ 
                        where: {
                            id: rewardHistory?.reference_reward_id || ''
                        },
                        include: [{
                            model: giftCardsModel,
                            attributes: ["name", "cashback_percentage", "description", "is_cashback"]
                        }],
                        attributes: { exclude: ["payment_status","status","is_deleted","createdAt","updatedAt","deleted_at"] }
                    });
                    rewardDetailsObj.dataValues.name = rewardDetailsObj.dataValues.gift_card.name;
                    rewardDetailsObj.dataValues.cashback_percentage = rewardDetailsObj.dataValues.gift_card.cashback_percentage;
                    rewardDetailsObj.dataValues.description = rewardDetailsObj.dataValues.gift_card.description;
                    rewardDetailsObj.dataValues.is_cashback = rewardDetailsObj.dataValues.gift_card.is_cashback;
                    delete rewardDetailsObj.dataValues.gift_card;
                    rewardHistory.dataValues.reward_details = rewardDetailsObj;
                    responseArr.push(rewardHistory)

                } else if (rewardHistory.reference_reward_type == 'cashbacks') {

                    const rewardDetailsObj = await cashbacksModel.findOne({
                        where: {
                            id: rewardHistory?.reference_reward_id || ''
                        },
                        attributes: ["id","title","description"]
                    });
                    rewardHistory.dataValues.reward_details = rewardDetailsObj;
                    responseArr.push(rewardHistory)

                } else if (rewardHistory.reference_reward_type == 'discounts') {

                    const rewardDetailsObj = await discountsModel.findOne({
                        where: {
                            id: rewardHistory?.reference_reward_id || ''
                        },
                        attributes: ["id","title"]
                    });
                    rewardHistory.dataValues.reward_details = rewardDetailsObj;
                    responseArr.push(rewardHistory)

                } else if (rewardHistory.reference_reward_type == 'coupones') {

                    const rewardDetailsObj = await couponesModel.findOne({
                        where: {
                            id: rewardHistory?.reference_reward_id || ''
                        },
                        attributes: ["id","title"]
                    });
                    rewardHistory.dataValues.reward_details = rewardDetailsObj;
                    responseArr.push(rewardHistory)

                } else if (rewardHistory.reference_reward_type == 'loyalty_points') {

                    const rewardDetailsObj = await loyaltyPointsModel.findOne({
                        where: {
                            id: rewardHistory?.reference_reward_id || ''
                        },
                        attributes: ["id","name"]
                    });
                    rewardHistory.dataValues.reward_details = rewardDetailsObj;
                    responseArr.push(rewardHistory)

                } else {
                    rewardHistory.dataValues.reward_details = null;
                    responseArr.push(rewardHistory)
                }
            }
        } else {
            responseArr = [...rewardHistoryData.rows];
        }
        const response = new pagination(responseArr, parseInt(rewardHistoryData?.count || 0), parseInt(data.page), parseInt(data.page_size) );
        res.send(setRes(resCode.OK, true, 'Reward History List',(response.getPaginationInfo())))

    } else {
        res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
    }
}