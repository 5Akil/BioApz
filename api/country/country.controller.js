var resCode = require("../../config/res_code_config");
var setRes = require("../../response");
var models = require("../../models");

// Create Country LIST START
exports.countryList = async (req, res) => {
    try {
        const data = req.body;
        const countryModel = models.countries;
        const Op = models.Op;
        const condition = {
            order: [["name", "ASC"]],
        };
        condition.where = {
            status: true,
            deleted_at: {
                [Op.eq]: null,
            },
        };
        condition.attributes = [
            "id",
            "country_code",
            "phone_code",
            "currency",
            "currency_symbol",
        ];
        const countries = await countryModel.findAll(condition);
        res.send(setRes(resCode.OK, true, "Countries list.", countries));
    } catch (error) {
        res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null));
    }
};
// Create Country LIST END
