'use strict';
module.exports = (sequelize, DataTypes) => {
    const LoyaltyTokenCardHistory = sequelize.define('loyalty_token_card_history', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        user_id: {
            type: DataTypes.INTEGER,
        },
        business_id: {
            type: DataTypes.INTEGER,
        },
        loyalty_token_card_id: {
            type: DataTypes.INTEGER,
        },
        order_id: {
            type: DataTypes.INTEGER,
        },
        order_no: {
            type: DataTypes.STRING,
        },
        status: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        is_Deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
    }, {
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
        // timestamps: false
    }
    );
    LoyaltyTokenCardHistory.associate = function (models) {
        LoyaltyTokenCardHistory.belongsTo(models.user, { foreignKey: 'user_id' })
        LoyaltyTokenCardHistory.belongsTo(models.business, { foreignKey: 'business_id' })
        LoyaltyTokenCardHistory.belongsTo(models.loyalty_token_cards, { foreignKey: 'loyalty_token_card_id' })
    };
    return LoyaltyTokenCardHistory;
};