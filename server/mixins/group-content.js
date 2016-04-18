module.exports = function(Model, options) {

	// define property: groupId which is used as a reference to the group
	// that "owns" the model instance
	Model.defineProperty("groupId", {type: "string", required: true});

	// define the belongTo relation to the Group. this is necessary to
	// distinguish GroupContent and decide who has access to what content
	var Group = require("loopback").getModel("Group");
	Model.belongsTo(Group, { foreignKey: "groupId", as: "owner"});

	// define access rules based on the group roles. define here all rules
	// which are common among ALL GroupContent Models. If a model needs
	// individual access rules, define them in the respective model.json

	Model.settings.acls.push(
		{
			"accessType": "*",
			"principalType": "ROLE",
			"principalId": "lib-user",
			"permission": "DENY"
		}
	);

	//////////////////////////////////
	/// UNAUTHENTICATED
	//////////////////////////////////
	Model.settings.acls.push(
		{
			"accessType": "*",
			"principalType": "ROLE",
			"principalId": "$everyone",
			"permission": "DENY"
		}
	);

	//////////////////////////////////
	/// ADMIN
	//////////////////////////////////
	Model.settings.acls.push(
		{
			"accessType": "*",
			"principalType": "ROLE",
			"principalId": "$group:admin",
			"permission": "ALLOW"
		}
	);

	//////////////////////////////////
	/// OWNER
	//////////////////////////////////
	Model.settings.acls.push(
		{
			"accessType": "*",
			"principalType": "ROLE",
			"principalId": "$group:owner",
			"permission": "ALLOW"
		}
	);

	//////////////////////////////////
	/// GUEST
	//////////////////////////////////
	Model.settings.acls.push(
		{
			"accessType": "READ",
			"principalType": "ROLE",
			"principalId": "$group:guest",
			"permission": "ALLOW"
		}
	);
	Model.settings.acls.push(
		{
			"accessType": "WRITE",
			"principalType": "ROLE",
			"principalId": "$group:guest",
			"permission": "ALLOW",
			"property": "updateSwitchState"
		}
	);

	//////////////////////////////////
	/// MEMBER
	//////////////////////////////////
	Model.settings.acls.push(
		{
			"accessType": "READ",
			"principalType": "ROLE",
			"principalId": "$group:member",
			"permission": "ALLOW"
		}
	);
	Model.settings.acls.push(
		{
			"accessType": "WRITE",
			"principalType": "ROLE",
			"principalId": "$group:member",
			"permission": "ALLOW",
			"property": "create"
		}
	);
	Model.settings.acls.push(
		{
			"accessType": "WRITE",
			"principalType": "ROLE",
			"principalId": "$group:member",
			"permission": "ALLOW",
			"property": "upsert"
		}
	);
	Model.settings.acls.push(
		{
			"accessType": "WRITE",
			"principalType": "ROLE",
			"principalId": "$group:member",
			"permission": "ALLOW",
			"property": "updateAttributes"
		}
	);
}
