'use strict';
module.exports = (sequelize, DataTypes) => {
    const loyaltyTokenCardIcon = sequelize.define('loyalty_token_icon', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },

        default_image: DataTypes.STRING,
        active_image: DataTypes.STRING,
        status: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        // tableName: 'loyalty_token_icon',
       
    },
    {
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    });
return loyaltyTokenCardIcon;
};