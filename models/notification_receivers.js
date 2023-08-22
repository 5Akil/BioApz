'use strict';
module.exports = (sequelize, DataTypes) => {
	const notificationReceivers = sequelize.define('notification_receivers', {
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
			autoIncrement: true,
		},
		role_id: {
			type: DataTypes.INTEGER,
		},
		notification_id: {
			type: DataTypes.INTEGER,
		},
		sender_id: {
			type: DataTypes.INTEGER,
		},
		receiver_id: {
			type: DataTypes.INTEGER,
		},
		is_read: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		  }, 
		is_deleted: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		  }, 
	}, {
		paranoid: true,
		createdAt: 'created_at',
		updatedAt: 'updated_at',
		deletedAt: 'deleted_at',
	   // timestamps: false
	 });

	notificationReceivers.associate = function(models) {
		notificationReceivers.belongsTo(models.role, {foreignKey: 'role_id'})
		notificationReceivers.belongsTo(models.notifications, {foreignKey: 'notification_id'})
	};
	
	return notificationReceivers;
}