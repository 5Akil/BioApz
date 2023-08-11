'use strict';
module.exports = (sequelize, DataTypes) => {
	const notifications = sequelize.define('notifications', {
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
			autoIncrement: true,
		},
		role_id: {
			type: DataTypes.INTEGER,
		},
		params: {
			type: DataTypes.TEXT,
		},
		title: {
			type: DataTypes.TEXT,
		},
		message: {
			type: DataTypes.STRING,
		},
		notification_type: {
			type: DataTypes.STRING,
		},
		status :{
			type: DataTypes.BOOLEAN,
			defaultValue: true
		},
	}, {
		paranoid: true,
		createdAt: 'created_at',
		updatedAt: 'updated_at',
		deletedAt: 'deleted_at',
	   // timestamps: false
	 });

	notifications.associate = function(models) {
		notifications.belongsTo(models.role, {foreignKey: 'role_id'})
		notifications.hasMany(models.notification_receivers, {foreignKey: 'notification_id'})
	};
	
	return notifications;
}