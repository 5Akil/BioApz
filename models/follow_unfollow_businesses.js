'use strict';
module.exports = (sequelize, DataTypes) => {
    const FollowUnfollowBusinesses = sequelize.define('follow_unfollow_businesses', {
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
        status:{
            type:DataTypes.BOOLEAN,
        }
        
    }, {
        // timestamps: false
    });
    FollowUnfollowBusinesses.associate = function (models) {
        FollowUnfollowBusinesses.belongsTo(models.user,{foreignKey: 'user_id' }) 
        FollowUnfollowBusinesses.belongsTo(models.business,{ foreignKey: 'business_id' }) 
    };
    return FollowUnfollowBusinesses;
};