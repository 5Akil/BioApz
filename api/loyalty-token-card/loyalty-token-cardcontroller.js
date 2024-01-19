
var resCode = require('../../config/res_code_config')
var commonConfig = require('../../config/common_config')
var setRes = require('../../response')
var models = require('../../models')
var _ = require('underscore')
var awsConfig = require("../../config/aws_S3_config");
const pagination = require('../../helpers/pagination')


exports.loyaltyTokenCardCreate = async (req, res) => {
    try {
        const data = req.body
        const businessModel = models.business
        const Op = models.Op
        const loyaltyCardModel = models.loyalty_token_cards
        let arrayFields = ['business_id', 'name', 'description', 'min_purchase_amount', 'product_id', 'no_of_tokens'];
        var requiredFields = _.reject(arrayFields, (o) => { return _.has(data, o) })
        if (requiredFields.length == 0) {
            const loyaltyCardName = data?.name?.trim() || data.name;
            if (!Number(data.min_purchase_amount) || isNaN(data.min_purchase_amount) || data.min_purchase_amount <= 0) {
                return res.send(setRes(resCode.BadRequest, false, "Minimum purchase amount value should be greater than 0!", null))
            }
            else if (!Number(data.no_of_tokens) || isNaN(data.no_of_tokens) || !(data.no_of_tokens >= 3) || !(data.no_of_tokens <= 10)) {
                return res.send(setRes(resCode.BadRequest, false, "Number of tokens should be between 3 to 10", null))
            }
            else {
                businessModel.findOne({
                    where: {
                        id: data.business_id,
                        is_deleted: false,
                        is_active: true
                    }
                }).then(async business => {
                    if (_.isEmpty(business)) {
                        return res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
                    } else {
                        loyaltyCardModel.findOne({
                            where: {
                                is_Deleted: false,
                                status: true,
                                name: {
                                    [Op.eq]: loyaltyCardName
                                }
                            }
                        }).then(async (loyaltiCard) => {
                            if (loyaltiCard) {
                                return res.send(setRes(resCode.BadRequest, false, "loyalty card name already taken.!", null))
                            } else {
                                loyaltyCardModel.create(data).then((loyaltiCardData) => {
                                    if (loyaltiCardData) {
                                        return res.send(setRes(resCode.OK, true, "Loyalty card published successfully", loyaltiCardData))
                                    } else {
                                        return res.send(setRes(resCode.InternalServer, false, "Internal server error", null))
                                    }
                                })
                            }
                        })
                    }
                })
            }
        } else {
            return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
        }
    } catch (error) {
        console.log(error);
        return res.send(setRes(resCode.BadRequest, false, "Something went wrong", null))
    }
}
exports.loyaltyTokenCardUpdate = async (req, res) => {
    try {
        const data = req.body
        const Op = models.Op
        const loyaltyCardModel = models.loyalty_token_cards
        let arrayFields = ['id', 'name', 'description', 'min_purchase_amount', 'product_id', 'no_of_tokens'];
        var requiredFields = _.reject(arrayFields, (o) => { return _.has(data, o) })
        if (requiredFields.length == 0) {
            if (!Number(data.min_purchase_amount) || isNaN(data.min_purchase_amount) || data.min_purchase_amount <= 0) {
                return res.send(setRes(resCode.BadRequest, false, "Minimum purchase amount value should be greater than 0!", null))
            } else if (!Number(data.no_of_tokens) || isNaN(data.no_of_tokens) || !(data.no_of_tokens >= 3) || !(data.no_of_tokens <= 10)) {
                return res.send(setRes(resCode.BadRequest, false, "Number of tokens should be between 3 to 10", null))
            } else {
                loyaltyCardModel.findOne({ where: { id: data.id, is_Deleted: false, status: true } }).then((loyaltyCardDetail) => {
                    if (_.isEmpty(loyaltyCardDetail)) {
                        return res.send(setRes(resCode.ResourceNotFound, false, "Loyalty card not found.", null))
                    } else {
                        loyaltyCardModel.findOne({ where: { is_Deleted: false, status: true, name: { [Op.eq]: data.name }, id: { [Op.ne]: data.id } } }).then((loyaltyCardData) => {
                            if (loyaltyCardData == null) {
                                loyaltyCardModel.update(data, {
                                    where: { id: data.id, is_Deleted: false, status: true }
                                }).then((updateData) => {
                                    if (updateData) {
                                        loyaltyCardModel.findOne({ where: { is_Deleted: false, status: true, id: data.id } }).then(updatedLoyaltyCard => {
                                            return res.send(setRes(resCode.OK, true, 'Loyalty Token card update successfully', updatedLoyaltyCard))
                                        })
                                    } else {
                                        return res.send(setRes(resCode.BadRequest, false, "Fail to update loyalty token card ", null))
                                    }
                                })
                            } else {
                                return res.send(setRes(resCode.BadRequest, false, "Loyalty token card name already taken.!", null))
                            }
                        })
                    }
                })
            }
        } else {
            return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
        }
    } catch (error) {
        return res.send(setRes(resCode.BadRequest, false, "Something went wrong", null))
    }
}
exports.loyaltyTokenCardDelete = async (req, res) => {
    try {
        var data = req.params
        var loyaltyCardModel = models.loyalty_token_cards
        var requiredFields = _.reject(['id'], (o) => { return _.has(data, o) })
        if (requiredFields == "") {
            loyaltyCardModel.findOne({
                where: {
                    id: data.id,
                    is_Deleted: false
                }
            }).then(async loyaltyCardData => {
                if (loyaltyCardData) {
                    await loyaltyCardData.update({
                        is_Deleted: true,
                        status: false
                    })
                    return res.send(setRes(resCode.OK, true, "Loyalty card deleted successfully", null))
                } else {
                    return res.send(setRes(resCode.ResourceNotFound, false, "Loyalty card not found", null))
                }
            }).catch(error => {
                return res.send(setRes(resCode.BadRequest, false, error, null))
            })
        } else {
            return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
        }

    } catch (error) {
        return res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null))
    }
}
exports.loyaltyTokenCardList = async (req, res) => {
    try {
        const data = req.body;
        const business_id = data.business_id || '';
        const loyaltyCardModel = models.loyalty_token_cards;
        const Op = models.Op;
        const skip = data.page_size * (data.page - 1);
        const limit = parseInt(data.page_size);
        const condition = {
            where: {
                business_id,
                status: true,
                is_Deleted: false,
                ...(data.search && {
                    [Op.or]: [{ name: { [Op.like]: `%${data.search}%` } }]
                }),
            },
            include: [
                { model: models.products },
                { model: models.loyalty_token_icon, attributes: ['default_image', 'active_image'] }
            ],
            order: [
                ['created_at', 'DESC']
            ],
            attributes: { exclude: ["status", "updatedAt", "created_at", "is_Deleted", 'token_icon_id', "business_id"] }
        }
        if (data.page_size != 0 && !_.isEmpty(data.page_size)) {
            (condition.offset = skip), (condition.limit = limit);
        }
        

        loyaltyCardModel.findAndCountAll(condition).then(async loyaltiCardData => {
            if (loyaltiCardData.rows.length != 0) {
                for (const item of loyaltiCardData.rows) {
                    item.dataValues.product_name = item.product.name
                    delete item.dataValues.product

                    if (item.loyalty_token_icon.default_image !== null) {
                        await awsConfig
                            .getSignUrl(item.loyalty_token_icon.default_image)
                            .then(function (res) {
                                item.loyalty_token_icon.default_image = res;
                            });
                    }
                    if (item.loyalty_token_icon.active_image !== null) {
                        await awsConfig
                            .getSignUrl(item.loyalty_token_icon.active_image)
                            .then(function (res) {
                                item.loyalty_token_icon.active_image = res;
                            });
                    }
                }
                const response = new pagination(
                    loyaltiCardData.rows,
                    loyaltiCardData.count,
                    parseInt(data.page),
                    parseInt(data.page_size)
                )
                return res.send(setRes(resCode.OK, true, "Loyalty cards List.", response.getPaginationInfo()));
            } else {
                return res.send(setRes(resCode.BadRequest, false, "There is no loyalty card", null))
            }
        })
    } catch (error) {
        return res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null))
    }
}
exports.loyaltyTokenCardPerformance = async (req, res) => {
    try {
        const data = req.body;
        const business = req.user;
        const sequelize = models.sequelize;
        const loyaltyCardModel = models.loyalty_token_cards;
        const loyaltyCardFreeProductModel = models.loyalty_token_claim_product;
        const loyaltyHistoryModel = models.loyalty_token_card_history;
        const completedUsers = [];
        const onGoingUsers = [];
        var requiredFields = _.reject(['loyalty_token_card_id'], (o) => { return _.has(data, o) });
        if (requiredFields == '') {
            const loyaltyCard = await loyaltyCardModel.findOne({ where: { id: data.loyalty_token_card_id, business_id: business.id, is_Deleted: false, status: true } });
            loyaltyHistoryModel.findAll({
                where: {
                    loyalty_token_card_id: data.loyalty_token_card_id,
                    status: true,
                    is_Deleted: false,
                },
                attributes: [
                    'user_id',
                    [sequelize.fn('COUNT', '*'), 'totalEntries'],
                ],
                group: ['user_id'],
            }).then((data) => {
                for (const item of data) {
                    if (item.dataValues.totalEntries == loyaltyCard.no_of_tokens) {
                        completedUsers.push(item)
                    } else if (item.dataValues.totalEntries < loyaltyCard.no_of_tokens) {
                        onGoingUsers.push(item)
                    };
                };
            });
            const claimedProductuser = await loyaltyCardFreeProductModel.findAll({
                where: { loyalty_token_card_id: data.loyalty_token_card_id, is_Deleted: false, status: true, is_claimed: true }
            });
            const responseBody = {
                totalOnGoingUsers: onGoingUsers.length,
                totalCompletedUsers: completedUsers.length,
                productClaimed: claimedProductuser.length
            };
            return res.send(setRes(resCode.OK, true, "Data fetched succcessfully", [responseBody]));
        } else {
            return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null));
        }
    } catch (error) {
        console.log(error);
        return res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null));
    }
}

exports.getLoyaltyTokenCardIcon = async (req, res) => {
    try {
        const imageModel = models.loyalty_token_icon;
        imageModel.findAll({ where: { status: true, is_deleted: false }, attributes: ['id', 'default_image', 'active_image'] }).then(async (images) => {
            if (!_.isNull(images)) {
                for (const item of images) {
                    if (item.default_image !== null) {
                        await awsConfig
                            .getSignUrl(item.default_image)
                            .then(function (res) {
                                item.default_image = res;
                            });
                    }
                    if (item.active_image !== null) {
                        await awsConfig
                            .getSignUrl(item.active_image)
                            .then(function (res) {
                                item.active_image = res;
                            });
                    }
                }
                return res.send(setRes(resCode.OK, true, "Token Images", images))
            } else {
                return res.send(setRes(resCode.BadRequest, false, "Images not found", null))
            }
        })
    } catch (error) {
        console.log(error);
        return res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null))
    }
}