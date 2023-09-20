const models = require('../../models');
const pagination = require('../../helpers/pagination');
const setRes = require('../../response')
const resCode = require('../../config/res_code_config');
const _ = require('underscore')
const moment = require('moment')
const MomentRange = require('moment-range');
const Moment = MomentRange.extendMoment(moment);
const awsConfig = require('../../config/aws_S3_config');

exports.rewardHistoryList = async (req,res) => {
    try {
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

        const requiredFields = _.reject(['page','page_size','type','user_id'],(o) => {return _.has(data,o)})

        if(requiredFields == '') {
            const blankFields = _.reject(['page','page_size','type','user_id'],(o) => {return data[o]});
            if(blankFields != "") {
                return res.send(setRes(resCode.BadRequest,false,(blankFields.toString() + ' can not be blank'),null))
            }

            const possibleTypeValue = ['rewards','loyalty_points'];
            if(!data?.type || !possibleTypeValue.includes(data?.type)) {
                return res.send(setRes(resCode.BadRequest,false,`Possible value for type is one from ${possibleTypeValue.join(',')}`,null));
            }

            const condition = {
                include: [
                    {
                        model: orderModel,
                        attributes: ["user_id","business_id","order_no","amount"],
                        where: {
                            user_id: data.user_id
                        },
                        required: true,
                    }
                ],
                attributes: {exclude: ["deleted_at","updatedAt"]},
                order: [
                    ["createdAt","DESC"]
                ]
            };
            condition.where = data.type == 'loyalty_points' ? {
                reference_reward_type: data.type
            } : {
                reference_reward_type: {
                    [Op.ne]: 'loyalty_points'
                }
            };
            const rewardHistoryData = await rewardHistoryModel.findAndCountAll(condition)
            let responseArr = [];
            if(rewardHistoryData?.rows && rewardHistoryData?.rows.length > 0) {
                for(let rewardHistory of rewardHistoryData?.rows) {
                    if(rewardHistory.reference_reward_type == 'gift_cards') {

                        let rewardDetailsObj = await userGiftCardsModel.findOne({
                            where: {
                                id: rewardHistory?.reference_reward_id || ''
                            },
                            include: [{
                                model: giftCardsModel,
                                attributes: ["name","cashback_percentage","description","is_cashback"]
                            }],
                            attributes: {exclude: ["payment_status","status","is_deleted","createdAt","updatedAt","deleted_at"]}
                        });
                        rewardDetailsObj.dataValues.name = rewardDetailsObj?.dataValues?.gift_card?.dataValues?.name || "";
                        rewardDetailsObj.dataValues.cashback_percentage = rewardDetailsObj?.dataValues?.gift_card?.dataValues?.cashback_percentage || "";
                        rewardDetailsObj.dataValues.description = rewardDetailsObj?.dataValues?.gift_card?.dataValues?.description || "";
                        rewardDetailsObj.dataValues.is_cashback = rewardDetailsObj?.dataValues?.gift_card?.dataValues?.is_cashback;
                        delete rewardDetailsObj.dataValues.gift_card;
                        rewardHistory.dataValues.reward_details = rewardDetailsObj;
                        responseArr.push(rewardHistory)

                    } else if(rewardHistory.reference_reward_type == 'cashbacks') {

                        const rewardDetailsObj = await cashbacksModel.findOne({
                            where: {
                                id: rewardHistory?.reference_reward_id || ''
                            },
                            attributes: ["id","title","description"]
                        });
                        rewardHistory.dataValues.reward_details = rewardDetailsObj;
                        responseArr.push(rewardHistory)

                    } else if(rewardHistory.reference_reward_type == 'discounts') {

                        const rewardDetailsObj = await discountsModel.findOne({
                            where: {
                                id: rewardHistory?.reference_reward_id || ''
                            },
                            attributes: ["id","title"]
                        });
                        rewardHistory.dataValues.reward_details = rewardDetailsObj;
                        responseArr.push(rewardHistory)

                    } else if(rewardHistory.reference_reward_type == 'coupones') {

                        const rewardDetailsObj = await couponesModel.findOne({
                            where: {
                                id: rewardHistory?.reference_reward_id || ''
                            },
                            attributes: ["id","title"]
                        });
                        rewardHistory.dataValues.reward_details = rewardDetailsObj;
                        responseArr.push(rewardHistory)

                    } else if(rewardHistory.reference_reward_type == 'loyalty_points') {

                        const rewardDetailsObj = await loyaltyPointsModel.findOne({
                            where: {
                                id: rewardHistory?.reference_reward_id || ''
                            },
                            attributes: ["id","name","validity_period"]
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
            const response = new pagination(responseArr,parseInt(rewardHistoryData?.count || 0),parseInt(data.page),parseInt(data.page_size));
            res.send(setRes(resCode.OK,true,'Reward History List',(response.getPaginationInfo())))

        } else {
            res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
        }
    } catch(error) {
        return res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
    }
}

exports.rewardHistoryBusinessList = async (req,res) => {
    try {
        const data = req.body;

        const rewardHistoryModel = models.reward_history;
        const orderModel = models.orders;
        const userModel = models.user;
        const userGiftCardsModel = models.user_giftcards;
        const giftCardsModel = models.gift_cards;

        const discountsModel = models.discounts;
        const cashbacksModel = models.cashbacks;
        const couponesModel = models.coupones;
        const loyaltyPointsModel = models.loyalty_points;

        const businessUser = req?.user;
        const Op = models.Op;

        const requiredFields = _.reject(['page','page_size'],(o) => {return _.has(data,o)})

        if(requiredFields == '') {
            const blankFields = _.reject(['page','page_size'],(o) => {return data[o]});
            if(blankFields != "") {
                return res.send(setRes(resCode.BadRequest,false,(blankFields.toString() + ' can not be blank'),null))
            }
            if(data.page < 0 || data.page === 0) {
                return res.send(setRes(resCode.BadRequest,false,"invalid page number, should start with 1",null))
            }
            const skip = data.page_size * (data.page - 1)
            const limit = parseInt(data.page_size)
            const condition = {
                offset: skip,
                limit: limit,
                include: [
                    {
                        model: orderModel,
                        attributes: ["user_id","business_id","order_no","amount"],
                        include: [
                            {
                                model: userModel,
                                attributes: ["id","username","email"]
                            }
                        ],
                        where: {
                            business_id: businessUser?.id || ''
                        },
                        required: true,
                    },
                ],
                attributes: {exclude: ["deleted_at","updatedAt"]},
                order: [
                    ["createdAt","DESC"]
                ]
            }
            let responseArr = [];
            const businessRewardHistoryData = await rewardHistoryModel.findAndCountAll(condition);
            if(businessRewardHistoryData?.rows && businessRewardHistoryData?.rows.length > 0) {
                for(let rewardHistory of businessRewardHistoryData?.rows) {
                    if(rewardHistory.reference_reward_type == 'gift_cards') {

                        let rewardDetailsObj = await userGiftCardsModel.findOne({
                            where: {
                                id: rewardHistory?.reference_reward_id || ''
                            },
                            include: [{
                                model: giftCardsModel,
                                attributes: ["name","cashback_percentage","description","is_cashback"]
                            }],
                            attributes: {exclude: ["payment_status","status","is_deleted","createdAt","updatedAt","deleted_at"]}
                        });
                        rewardDetailsObj.dataValues.name = rewardDetailsObj?.dataValues?.gift_card?.dataValues?.name || "";
                        rewardDetailsObj.dataValues.cashback_percentage = rewardDetailsObj?.dataValues?.gift_card?.dataValues?.cashback_percentage || "";
                        rewardDetailsObj.dataValues.description = rewardDetailsObj?.dataValues?.gift_card?.dataValues?.description || "";
                        rewardDetailsObj.dataValues.is_cashback = rewardDetailsObj?.dataValues?.gift_card?.dataValues?.is_cashback;
                        delete rewardDetailsObj.dataValues.gift_card;
                        rewardHistory.dataValues.reward_details = rewardDetailsObj;
                        responseArr.push(rewardHistory)

                    } else if(rewardHistory.reference_reward_type == 'cashbacks') {

                        const rewardDetailsObj = await cashbacksModel.findOne({
                            where: {
                                id: rewardHistory?.reference_reward_id || ''
                            },
                            attributes: ["id","title","description"]
                        });
                        rewardHistory.dataValues.reward_details = rewardDetailsObj;
                        responseArr.push(rewardHistory)

                    } else if(rewardHistory.reference_reward_type == 'discounts') {

                        const rewardDetailsObj = await discountsModel.findOne({
                            where: {
                                id: rewardHistory?.reference_reward_id || ''
                            },
                            attributes: ["id","title"]
                        });
                        rewardHistory.dataValues.reward_details = rewardDetailsObj;
                        responseArr.push(rewardHistory)

                    } else if(rewardHistory.reference_reward_type == 'coupones') {

                        const rewardDetailsObj = await couponesModel.findOne({
                            where: {
                                id: rewardHistory?.reference_reward_id || ''
                            },
                            attributes: ["id","title"]
                        });
                        rewardHistory.dataValues.reward_details = rewardDetailsObj;
                        responseArr.push(rewardHistory)

                    } else if(rewardHistory.reference_reward_type == 'loyalty_points') {

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
                responseArr = [...businessRewardHistoryData.rows]
            }

            const totalCount = businessRewardHistoryData?.count;

            const response = new pagination(responseArr,parseInt(totalCount || 0),parseInt(data.page),parseInt(data.page_size));
            res.send(setRes(resCode.OK,true,'Business Reward History List',(response.getPaginationInfo())));
        } else {
            res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
        }
    } catch(error) {
        return res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
    }
}

const dateListForTimeinterval = async (startObj,endObj,interval = 'monthly') => {
    let array = [];
    if(interval == 'monthly') {
        let startDate = moment(`${startObj.month}/01/${startObj.year}`);
        let endDate = moment(`${endObj.month}/01/${endObj.year}`);
        while(startDate.isValid() && endDate.isValid() && (startDate.isBefore(endDate) || startDate.isSame(endDate))) {
            array.push(moment(startDate));
            startDate = startDate.add('1','M');
        }
    } else if(interval == 'weekly') {
        let startDate = moment().day("Monday").week(startObj?.week || moment().week());
        let endDate = moment().day("Monday").week(endObj?.week || moment().week());
        while(startDate.isBefore(endDate) || startDate.isSame(endDate)) {
            array.push(moment(startDate));
            startDate = startDate.add('1','weeks');
        }
    } else if(interval == 'custom') {
        let startDate = moment(startObj);
        let endDate = moment(endObj);
        while(startDate.isValid() && endDate.isValid() && startDate.isBefore(endDate) || startDate.isSame(endDate)) {
            array.push(moment(startDate));
            startDate = startDate.add('1','d');
        }
    }
    return array;
}

exports.rewardPerfomance = async (req,res) => {
    try {
        const data = req.body;
        const rewardHistoryModel = models.reward_history;

        const userModel = models.user;
        const userGiftCardsModel = models.user_giftcards;
        const giftCardsModel = models.gift_cards;

        const discountsModel = models.discounts;
        const cashbacksModel = models.cashbacks;
        const couponesModel = models.coupones;
        const loyaltyPointsModel = models.loyalty_points;
        const orderModel = models.orders;

        const requiredFields = _.reject(['reward_id','type'],(o) => {return _.has(data,o)})
        if(requiredFields == '') {
            const blankFields = _.reject(['reward_id','type'],(o) => {return data[o]});
            if(blankFields != "") {
                return res.send(setRes(resCode.BadRequest,false,(blankValue.toString() + ' can not be blank'),null))
            }

            const possibleTypeValue = ['gift_cards','cashbacks','coupones','discounts','loyalty_points'];
            if(!data?.type || !possibleTypeValue.includes(data?.type)) {
                return res.send(setRes(resCode.BadRequest,false,`Possible value for type is one from ${possibleTypeValue.join(',')}`,null));
            }

            let timeInterval = data?.time_interval && data.time_interval != undefined ? data?.time_interval : '';
            if(timeInterval != '' && !['weekly','monthly','yearly','custom'].includes(timeInterval)) {
                return res.send(setRes(resCode.BadRequest,false,`Possible value for time interval is one from weekly, monthly, yearly, custom`,null));
            }
            /** Check startdate and enddate for custom */
            let startDate,endDate;
            if(timeInterval == 'custom') {
                startDate = data.start_date ? moment(`${data.start_date}`) : '';
                endDate = data.end_date ? moment(`${data.end_date}`) : '';
                if(!startDate || !endDate) {
                    return res.send(setRes(resCode.BadRequest,false,`Please select valid start date and end date`,null));
                }
                const range = Moment.range(startDate,endDate);
                const isEndDateBeforeStartDate = moment(endDate).isBefore(startDate);
                if(isEndDateBeforeStartDate) {
                    return res.send(setRes(resCode.BadRequest,false,`Please select valid start date and end date`,null));
                }
            }

            /** Inputs rewatd type and reward id to check perfomance  */
            const rewardId = data?.reward_id || '';
            const rewardType = data?.type ? data?.type.trim() : '';

            let responseObject = {}
            if(rewardType == 'gift_cards') {

                // Fetch Reward details
                const giftCardDetails = await giftCardsModel.findOne({
                    where: {
                        id: rewardId,
                    }
                });
                responseObject.generatedDate = giftCardDetails?.createdAt || '';

                // attributes and where clause conditions for different time intervals
                const weekMonthYear = [
                    [models.sequelize.fn("YEAR",models.sequelize.col("user_giftcards.createdAt")),'year'],
                    [models.sequelize.fn("WEEK",models.sequelize.col("user_giftcards.createdAt")),'week'],
                    [models.sequelize.fn("MONTH",models.sequelize.col("user_giftcards.createdAt")),'month'],
                ]

                let timeIntervalCondition,timeIntervalConditionForRewardTable;
                if(timeInterval == 'monthly' && data.month) {
                    timeIntervalCondition = models.sequelize.where(models.sequelize.fn("MONTH",models.sequelize.col("user_giftcards.createdAt")),data.month ? data.month : moment().month() + 1),
                        models.sequelize.where(models.sequelize.fn("YEAR",models.sequelize.col("user_giftcards.createdAt")),data.year ? data.year : moment().year());

                    timeIntervalConditionForRewardTable = models.sequelize.where(models.sequelize.fn("MONTH",models.sequelize.col("reward_history.createdAt")),data.month ? data.month : moment().month() + 1),
                        models.sequelize.where(models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),data.year ? data.year : moment().year())
                }
                if(timeInterval == 'yearly' && data.year) {
                    timeIntervalCondition = models.sequelize.where(models.sequelize.fn("YEAR",models.sequelize.col("user_giftcards.createdAt")),data.year ? data.year : moment().year())

                    timeIntervalConditionForRewardTable = models.sequelize.where(models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),data.year ? data.year : moment().year())
                }
                if(timeInterval == 'weekly' && data.week) {
                    timeIntervalCondition = models.sequelize.where(models.sequelize.fn("WEEK",models.sequelize.col("user_giftcards.createdAt")),data.week ? data.week : moment().week()),
                        models.sequelize.where(models.sequelize.fn("YEAR",models.sequelize.col("user_giftcards.createdAt")),data.year ? data.year : moment().year())

                    timeIntervalConditionForRewardTable = models.sequelize.where(models.sequelize.fn("WEEK",models.sequelize.col("reward_history.createdAt")),data.week ? data.week : moment().week()),
                        models.sequelize.where(models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),data.year ? data.year : moment().year())
                }
                if(timeInterval == 'custom') {

                    timeIntervalCondition = {
                        [models.Op.and]: [
                            {
                                createdAt: {
                                    [models.Op.gte]: startDate,
                                }
                            },
                            {
                                createdAt: {
                                    [models.Op.lte]: endDate,
                                }
                            }
                        ]
                    }

                    timeIntervalConditionForRewardTable = {
                        [models.Op.and]: [
                            {
                                createdAt: {
                                    [models.Op.gte]: startDate,
                                }
                            },
                            {
                                createdAt: {
                                    [models.Op.lte]: endDate,
                                }
                            }
                        ]
                    }
                }

                const condition = {
                    where: {
                        [models.Op.and]: [
                            {
                                gift_card_id: rewardId,
                                status: true,
                                is_deleted: false
                            },
                            timeIntervalCondition ? (timeInterval != 'custom' ? {timeIntervalCondition} : {...timeIntervalCondition}) : true
                        ]
                    },
                    attributes: [
                        [models.sequelize.fn('sum',models.sequelize.col('amount')),'total_amount'],
                        ...weekMonthYear
                    ],
                }
                // total purcase count and total purchased amount 
                const totalUsersPurchasedGiftCards = await userGiftCardsModel.findAndCountAll(condition);
                responseObject.totalPurchase = totalUsersPurchasedGiftCards?.count || 0;
                responseObject.totalEarnings = totalUsersPurchasedGiftCards?.rows[0]?.dataValues?.total_amount ? Number(totalUsersPurchasedGiftCards?.rows[0]?.dataValues?.total_amount) : 0;

                // total purchase by user count
                const userPurchasedGiftCardsCount = await userGiftCardsModel.findAndCountAll({
                    include: [
                        {
                            model: userModel,
                            attributes: ["id","username"],
                            where: {
                                role_id: 2
                            },
                            required: true
                        }
                    ],
                    attributes: [...weekMonthYear],
                    where: {
                        [models.Op.and]: [
                            {
                                gift_card_id: rewardId,
                                status: true,
                                is_deleted: false
                            },
                            timeIntervalCondition ? (timeInterval != 'custom' ? {timeIntervalCondition} : {...timeIntervalCondition}) : true
                        ]
                    },
                });
                responseObject.purchasedByUser = userPurchasedGiftCardsCount?.count || 0;

                // User used reward counts
                console.log('\n\nuserUsedRewardCounts');
                const userUsedRewardCounts = await rewardHistoryModel.findAndCountAll({
                    attributes: {
                        include: [
                            [models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),'year'],
                            [models.sequelize.fn("WEEK",models.sequelize.col("reward_history.createdAt")),'week'],
                            [models.sequelize.fn("MONTH",models.sequelize.col("reward_history.createdAt")),'month'],
                        ]
                    },
                    where: {
                        [models.Op.and]: [
                            {
                                reference_reward_type: rewardType,
                                reference_reward_id: rewardId,
                                credit_debit: true,
                                order_id: {
                                    [models.Op.ne]: null
                                }
                            },
                            timeIntervalConditionForRewardTable ? (timeInterval != 'custom' ? {timeIntervalConditionForRewardTable} : {...timeIntervalConditionForRewardTable}) : true
                        ]
                    }
                });
                responseObject.usedByUser = userUsedRewardCounts?.count || 0
                console.log('\n\nuserUsedRewardCounts  count: ',userUsedRewardCounts?.count);

                // pending gift cards
                const pendingUserGiftCards = await userGiftCardsModel.findAndCountAll({
                    where: {
                        [models.Op.and]: [
                            {
                                gift_card_id: rewardId,
                                payment_status: 0,
                                status: true,
                                is_deleted: false
                            },
                            timeIntervalCondition ? (timeInterval != 'custom' ? {timeIntervalCondition} : {...timeIntervalCondition}) : true
                        ]
                    },
                    attributes: [
                        [models.sequelize.fn('sum',models.sequelize.col('amount')),'total_amount'],
                        ...weekMonthYear
                    ]
                });
                responseObject.pending = pendingUserGiftCards?.rows[0]?.dataValues?.total_amount ? Number(pendingUserGiftCards?.rows[0]?.dataValues?.total_amount) : 0

                /** Graph data for */

            } else if(['cashbacks','coupones','discounts','loyalty_points'].includes(rewardType)) {
                // Total Purchase
                let timeIntervalCondition;
                if(timeInterval == 'monthly' && data.month) {
                    timeIntervalCondition = models.sequelize.where(models.sequelize.fn("MONTH",models.sequelize.col("reward_history.createdAt")),data.month ? data.month : moment().month() + 1),models.sequelize.where(models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),data.year ? data.year : moment().year())
                }
                if(timeInterval == 'yearly' && data.year) {
                    timeIntervalCondition = models.sequelize.where(models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),data.year ? data.year : moment().year())
                }
                if(timeInterval == 'weekly' && data.week) {
                    timeIntervalCondition = models.sequelize.where(models.sequelize.fn("WEEK",models.sequelize.col("reward_history.createdAt")),data.week ? data.week : moment().week())
                }
                if(timeInterval == 'custom') {

                    timeIntervalCondition = {
                        [models.Op.and]: [
                            {
                                createdAt: {
                                    [models.Op.gte]: startDate,
                                }
                            },
                            {
                                createdAt: {
                                    [models.Op.lte]: endDate,
                                }
                            }
                        ]
                    }
                }
                const condition = {
                    include: [
                        {
                            model: orderModel,
                            attributes: ["id","amount","order_status"],
                        }
                    ],
                    attributes: {
                        include: [
                            [models.sequelize.fn('sum',models.sequelize.col('order.amount')),'total_amount'],
                            [models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),'year'],
                            [models.sequelize.fn("WEEK",models.sequelize.col("reward_history.createdAt")),'week'],
                            [models.sequelize.fn("MONTH",models.sequelize.col("reward_history.createdAt")),'month'],
                        ]
                    },
                    where: {
                        [models.Op.and]: [
                            {
                                reference_reward_type: rewardType,
                                reference_reward_id: rewardId,
                                credit_debit: true,
                            },
                            timeIntervalCondition ? (timeInterval != 'custom' ? {timeIntervalCondition} : {...timeIntervalCondition}) : true
                        ]
                    },
                }
                const purchasedTotalOrdersCashbacks = await rewardHistoryModel.findAll(condition);
                responseObject.totalPurchase = (purchasedTotalOrdersCashbacks[0]?.dataValues?.total_amount) ? Number(purchasedTotalOrdersCashbacks[0]?.dataValues?.total_amount || 0) : 0;

                // total cashback redeem amount
                const totalCashbackRdeemCondition = {
                    include: [
                        {
                            model: orderModel,
                            attributes: ["id","order_status"],
                            where: {
                                order_status: 3 // completed
                            }
                        }
                    ],
                    where: {
                        [models.Op.and]: [
                            {
                                reference_reward_type: rewardType,
                                reference_reward_id: rewardId,
                                credit_debit: true,
                            },
                            timeIntervalCondition ? (timeInterval != 'custom' ? {timeIntervalCondition} : {...timeIntervalCondition}) : true
                        ]
                    },
                };
                const totalRedeemAmountData = await rewardHistoryModel.findAll({
                    ...totalCashbackRdeemCondition,
                    attributes: {
                        include: [
                            [models.sequelize.fn('sum',models.sequelize.col('reward_history.amount')),'total_amount'],
                            [models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),'year'],
                            [models.sequelize.fn("WEEK",models.sequelize.col("reward_history.createdAt")),'week'],
                            [models.sequelize.fn("MONTH",models.sequelize.col("reward_history.createdAt")),'month'],
                        ]
                    },
                });
                responseObject.totalRedeemAmount = totalRedeemAmountData[0]?.dataValues?.total_amount ? Number(totalRedeemAmountData[0]?.dataValues?.total_amount || 0) : 0;

                // total cashback redeem by users count
                const totalRedeemByUser = await rewardHistoryModel.findAndCountAll({
                    attributes: {
                        include: [
                            [models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),'year'],
                            [models.sequelize.fn("WEEK",models.sequelize.col("reward_history.createdAt")),'week'],
                            [models.sequelize.fn("MONTH",models.sequelize.col("reward_history.createdAt")),'month'],
                        ]
                    },
                    where: {
                        [models.Op.and]: [
                            {
                                reference_reward_type: rewardType,
                                reference_reward_id: rewardId,
                                credit_debit: true,
                            },
                            timeIntervalCondition ? (timeInterval != 'custom' ? {timeIntervalCondition} : {...timeIntervalCondition}) : {}
                        ]
                    },
                });
                responseObject.totalRedeemByUser = totalRedeemByUser?.count || 0;

                // Total pending amount
                const totalPendingAmountcondition = {
                    include: [
                        {
                            model: orderModel,
                            attributes: ["id","order_status"],
                            where: {
                                order_status: 1 // pending
                            }
                        }
                    ],
                    attributes: {
                        include: [
                            [models.sequelize.fn('sum',models.sequelize.col('reward_history.amount')),'total_amount'],
                            [models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),'year'],
                            [models.sequelize.fn("WEEK",models.sequelize.col("reward_history.createdAt")),'week'],
                            [models.sequelize.fn("MONTH",models.sequelize.col("reward_history.createdAt")),'month'],
                        ]
                    },
                    where: {
                        [models.Op.and]: [
                            {
                                reference_reward_type: rewardType,
                                reference_reward_id: rewardId,
                                credit_debit: true,
                            },
                            timeIntervalCondition ? (timeInterval != 'custom' ? {timeIntervalCondition} : {...timeIntervalCondition}) : true
                        ]
                    }
                }
                const totalPendingAmount = await rewardHistoryModel.findAll(totalPendingAmountcondition);
                responseObject.totalPendingAmount = totalPendingAmount[0]?.dataValues?.total_amount ? Number(totalPendingAmount[0]?.dataValues?.total_amount) : 0;

            } else {
                responseObject = {
                    totalPurchase: 0,
                    totalRedeemAmount: 0,
                    totalRedeemByUser: 0,
                    totalPendingAmount: 0
                }

                responseObject.graphData = {
                    dataSet: [],
                    label: []
                }
            }


            /**
             * Graph data fetch 
             */
            if(['gift_cards','cashbacks','coupones','discounts','loyalty_points'].includes(rewardType)) {
                const includeAttribute = []
                const groupBy = [];
                const label = [],dataSet = [];

                // default monthly graph
                includeAttribute.push([models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),'year']);
                includeAttribute.push([models.sequelize.fn("MONTH",models.sequelize.col("reward_history.createdAt")),'month']);
                groupBy.push(["month","year"]);
                timeInterval = timeInterval ? timeInterval : "monthly";

                if(timeInterval == 'yearly') {
                    includeAttribute.push([models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),'year']);
                    groupBy.push("year");
                }

                if(timeInterval == 'weekly') {
                    includeAttribute.push([models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),'year']);
                    includeAttribute.push([models.sequelize.fn("WEEK",models.sequelize.col("reward_history.createdAt")),'week'])
                    groupBy.push(["week","year"]);
                }
                let customTimeCondition = {};
                if(timeInterval == 'custom') {
                    includeAttribute.push([models.sequelize.fn("DAY",models.sequelize.col("reward_history.createdAt")),'day'])
                    includeAttribute.push([models.sequelize.fn("YEAR",models.sequelize.col("reward_history.createdAt")),'year']);
                    includeAttribute.push([models.sequelize.fn("WEEK",models.sequelize.col("reward_history.createdAt")),'week'])
                    groupBy.push(["day","month","year"]);
                    customTimeCondition = {
                        [models.Op.and]: [
                            {
                                createdAt: {
                                    [models.Op.gte]: startDate,
                                }
                            },
                            {
                                createdAt: {
                                    [models.Op.lte]: endDate,
                                }
                            }
                        ]
                    }
                }
                const totalRedeemAmountDataByInterval = await rewardHistoryModel.findAll({
                    include: [
                        {
                            model: orderModel,
                            attributes: ["id","order_status"],
                            where: {
                                order_status: 3 // completed
                            },
                            required: false
                        }
                    ],
                    where: {
                        reference_reward_id: rewardId,
                        reference_reward_type: rewardType,
                        credit_debit: true,
                        ...customTimeCondition
                    },
                    attributes: {
                        include: [
                            ...includeAttribute,
                            [models.sequelize.fn('sum',models.sequelize.col('reward_history.amount')),'total_amount'],
                        ]
                    },
                    group: groupBy,
                    raw: true,
                });
                if(timeInterval == 'yearly') {
                    // totalRedeemAmountDataByInterval
                    const sortByYearAsc = totalRedeemAmountDataByInterval.sort((objA,objB) => objA.year - objB.year);
                    const startYearObj = sortByYearAsc.length > 0 ? sortByYearAsc[0] : 0;
                    const endYearObj = sortByYearAsc.length > 0 ? sortByYearAsc[sortByYearAsc.length - 1] : 0;
                    // for (let i = startYearObj?.year; i <= endYearObj?.year; i++) {
                    //     label.push(`${i}`);
                    //     const index = sortByYearAsc.findIndex((obj) => obj?.year == i);
                    //     dataSet.push(index >= 0 ? sortByYearAsc[index]?.total_amount : 0);
                    // }
                    let i = startYearObj.year;

                    for(ind of Array(endYearObj.year - startYearObj.year + 1).keys()) {
                        label.push(`${i}`);
                        const index = sortByYearAsc.findIndex((obj) => obj?.year == i);
                        dataSet.push(index >= 0 ? sortByYearAsc[index]?.total_amount : 0);
                        i++;
                    }
                }
                if(timeInterval == 'monthly') {
                    const sortByMonthAsc = totalRedeemAmountDataByInterval.sort((objA,objB) => objA.month - objB.month);
                    const sortByYearAsc = sortByMonthAsc.sort((objA,objB) => objA.year - objB.year);

                    const startMonthObj = sortByYearAsc.length > 0 ? sortByYearAsc[0] : 0;
                    const endMonthObj = sortByYearAsc.length > 0 ? sortByYearAsc[sortByYearAsc.length - 1] : 0;

                    const monthList = await dateListForTimeinterval(startMonthObj,endMonthObj,'monthly');
                    for(const date of monthList) {
                        const monthNo = date.month() + 1;
                        const yearNo = date.year();
                        const index = sortByYearAsc.findIndex((obj) => obj?.month == monthNo && obj?.year == yearNo);
                        label.push(`${monthNo}/${yearNo}`);
                        dataSet.push(index >= 0 ? sortByYearAsc[index]?.total_amount : 0);
                    }
                    // for (let j = startMonthObj?.year; j <= endMonthObj?.year; j++) {
                    //     for (let i = startMonthObj?.month; i <= endMonthObj?.month; i++) {
                    //         label.push(`${i}/${j}`);
                    //         const index = sortByYearAsc.findIndex((obj) => obj?.month == i);
                    //         dataSet.push(index >= 0 ? sortByYearAsc[index]?.total_amount : 0);
                    //     }
                    // }

                }
                if(timeInterval == 'weekly') {
                    const sortByWeekAsc = totalRedeemAmountDataByInterval.sort((objA,objB) => objA.week - objB.week);
                    const sortByYearAsc = sortByWeekAsc.sort((objA,objB) => objA.year - objB.year);

                    const startWeekObj = sortByYearAsc.length > 0 ? sortByYearAsc[0] : 0;
                    const endWeekObj = sortByYearAsc.length > 0 ? sortByYearAsc[sortByYearAsc.length - 1] : 0;
                    const weeklyList = await dateListForTimeinterval(startWeekObj,endWeekObj,'weekly');
                    // for (let j = startWeekObj?.year; j <= endWeekObj?.year; j++) {
                    //     for (let i = startWeekObj?.week; i <= endWeekObj?.week; i++) {
                    //         label.push(`Week ${i}, ${j}`);
                    //         const index = sortByYearAsc.findIndex((obj) => obj?.week == i &&  obj?.year == j);
                    //         dataSet.push(index >= 0 ? sortByYearAsc[index]?.total_amount : 0);
                    //     }
                    // }
                    for(const date of weeklyList) {
                        const weekNo = date.week();
                        const yearNo = date.year();
                        console.log('weekNo, yearNo',weekNo,yearNo);
                        const index = sortByYearAsc.findIndex((obj) => obj?.week == weekNo && obj?.year == yearNo);
                        label.push(`Week ${weekNo}, ${yearNo}`);
                        dataSet.push(index >= 0 ? sortByYearAsc[index]?.total_amount : 0);
                    }
                }
                if(timeInterval == 'custom') {
                    const sortByDayAsc = totalRedeemAmountDataByInterval.sort((objA,objB) => objA.year - objB.year);
                    const sortByMonthAsc = sortByDayAsc.sort((objA,objB) => objA.month - objB.month);
                    const sortByYearAsc = sortByMonthAsc.sort((objA,objB) => objA.day - objB.day);

                    const startDayObj = sortByYearAsc.length > 0 ? sortByYearAsc[0] : 0;
                    const endDayObj = sortByYearAsc.length > 0 ? sortByYearAsc[sortByYearAsc.length - 1] : 0;

                    const customDateList = await dateListForTimeinterval(data.start_date,data.end_date,'custom');
                    // for (let k = startDayObj?.year; k <= endDayObj?.year; k++) {
                    //     for (let j = startDayObj?.month; j <= endDayObj?.month; j++) {
                    //         for (let i = startDayObj?.day; i <= endDayObj?.day; i++) {
                    //             label.push(`${i}/${j}/${k}`);
                    //             const index = sortByYearAsc.findIndex((obj) => obj?.day == i && obj?.month == j && obj?.year == k);
                    //             dataSet.push(index >= 0 ? sortByYearAsc[index]?.total_amount : 0);
                    //         }
                    //     }
                    // }
                    for(const date of customDateList) {
                        const dayNo = date.date();
                        const monthNo = date.month() + 1;
                        const yearNo = date.year();
                        const index = sortByYearAsc.findIndex((obj) => obj?.day == dayNo && obj?.month == monthNo && obj?.year == yearNo);
                        label.push(`${dayNo}/${monthNo}/${yearNo}`);
                        dataSet.push(index >= 0 ? sortByYearAsc[index]?.total_amount : 0);
                    }
                }
                responseObject.graphData = {
                    dataSet,
                    label
                }

            } else {
                responseObject.graphData = {
                    dataSet: [],
                    label: []
                }
            }

            return res.send(setRes(resCode.OK,true,'Perfomance details!',responseObject))
        } else {
            return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
        }
    } catch(error) {
        return res.send(setRes(resCode.BadRequest,false,error?.message || "Something went wrong!",null))
    }
}

/** Purchased or Earned rewards by user list */
exports.purchasedEarnedRewardList = async (req,res) => {
    try {
        const data = req.body;

        const rewardHistoryModel = models.reward_history;
        const userModel = models.user;
        const userGiftCardsModel = models.user_giftcards;
        const orderModel = models.orders

        const requiredFields = _.reject(['reward_id','type','page','page_size'],(o) => {return _.has(data,o)})
        if(requiredFields == '') {

            const typeArr = ['gift_cards','cashbacks','discounts','coupones','loyalty_points'];
            const request_type = data.type
            if((request_type) && !(typeArr.includes(request_type))) {
                return res.send(setRes(resCode.BadRequest,null,false,"Please select valid type."))
            }

            if(data.page < 0 || data.page === 0) {
                return res.send(setRes(resCode.BadRequest,false,"invalid page number, should start with 1",null))
            }

            if(request_type == 'gift_cards') {
                const responseArr = [];
                const giftCards = await userGiftCardsModel.findAndCountAll({
                    include: [
                        {
                            model: userModel,
                            attributes: ['id','username','profile_picture']
                        }
                    ],
                    attributes: ['id','amount','createdAt'],
                    where: {
                        gift_card_id: data.reward_id
                    }
                });
                for(let giftCard of giftCards?.rows) {
                    var profile_picture = await awsConfig.getSignUrl(giftCard.user.profile_picture).then(function(res) {
                        giftCard.dataValues.profile_picture = res
                    });
                    giftCard.dataValues.username = giftCard.user.username;
                    delete giftCard?.dataValues?.user;
                    responseArr.push(giftCard);
                }
                const totalRecords = giftCards?.count || 0;
                const response = new pagination(giftCards.rows,totalRecords,parseInt(data.page),parseInt(data.page_size));
                return res.send(setRes(resCode.OK,true,'Purchased Reward List',(response.getPaginationInfo())))
            } else if(['cashbacks','coupones','discounts','loyalty_points'].includes(request_type)) {
                const responseArr = [];
                const rewards = await rewardHistoryModel.findAndCountAll({
                    include: [
                        {
                            model: orderModel,
                            attributes: ["id"],
                            include: [
                                {
                                    model: userModel,
                                    attributes: ["id","username","profile_picture"]
                                }
                            ]
                        }
                    ],
                    attributes: ['id','amount','createdAt'],
                    where: {
                        reference_reward_type: request_type,
                        reference_reward_id: data.reward_id,
                    },
                    order: [
                        ['createdAt','DESC']
                    ]
                });
                for(let reward of rewards?.rows) {
                    var profile_picture = await awsConfig.getSignUrl(reward.order.user.profile_picture).then(function(res) {
                        reward.dataValues.profile_picture = res
                    });
                    reward.dataValues.username = reward.order.user.username;
                    delete reward?.dataValues?.order;
                    responseArr.push(reward);
                }
                const totalRecords = rewards?.count || 0;
                const response = new pagination(responseArr,totalRecords,parseInt(data.page),parseInt(data.page_size));
                return res.send(setRes(resCode.OK,true,'Earned Reward List',(response.getPaginationInfo())))
            }
        } else {
            return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
        }
    } catch(error) {
        return res.send(setRes(resCode.BadRequest,false,error?.message || "Something went wrong!",null))
    }
}