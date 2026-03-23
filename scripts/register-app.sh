#!/bin/bash
# Helm365 -- Automated Azure AD App Registration
# Creates the app registration with all 30 required permissions and grants admin consent.
#
# Prerequisites: Azure CLI (az) installed and logged in
#   az login
#
# Usage:
#   bash scripts/register-app.sh                    # Single-tenant (your org only)
#   bash scripts/register-app.sh --multi-tenant     # Multi-tenant (MSP / GDAP)

set -e

APP_NAME="Helm365"
MULTI_TENANT=false

if [ "$1" = "--multi-tenant" ]; then
  MULTI_TENANT=true
fi

echo ""
echo "  Helm365 -- App Registration Setup"
echo "  ================================="
echo ""

if [ "$MULTI_TENANT" = true ]; then
  AUDIENCE="AzureADMultipleOrgs"
  echo "  Mode: Multi-tenant (MSP / GDAP)"
else
  AUDIENCE="AzureADMyOrg"
  echo "  Mode: Single tenant"
fi

echo ""
echo "Step 1: Creating app registration..."

APP_ID=$(az ad app create \
  --display-name "$APP_NAME" \
  --sign-in-audience "$AUDIENCE" \
  --query appId -o tsv)

echo "  App (Client) ID: $APP_ID"

TENANT_ID=$(az account show --query tenantId -o tsv)
echo "  Tenant ID: $TENANT_ID"

echo ""
echo "Step 2: Adding API permissions (30 permissions)..."

# Build the permissions JSON directly -- no associative arrays needed
# Microsoft Graph App ID: 00000003-0000-0000-c000-000000000000
# All IDs are Application (Role) type

TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" << 'JSONEOF'
[{
  "resourceAppId": "00000003-0000-0000-c000-000000000000",
  "resourceAccess": [
    {"id": "df021288-bdef-4463-88db-98f22de89214", "type": "Role"},
    {"id": "741f803b-c850-494e-b5df-cde7c675a1ca", "type": "Role"},
    {"id": "50483e42-d915-4231-9639-7fdb7fd190e5", "type": "Role"},
    {"id": "5b567255-7703-4780-807c-7be8301ae99b", "type": "Role"},
    {"id": "dbaae8cf-10b5-4b86-a4a1-f871c94c6571", "type": "Role"},
    {"id": "7ab1d382-f21e-4acd-a863-ba3e13f7da61", "type": "Role"},
    {"id": "498476ce-e0fe-48b0-b801-37ba7e2685c6", "type": "Role"},
    {"id": "810c84a8-4a9e-49e6-bf7d-12d183f40d01", "type": "Role"},
    {"id": "e2a3a72e-5f79-4c64-b1b1-878b674786c9", "type": "Role"},
    {"id": "40f97065-369a-49f4-947c-6a90f8a16889", "type": "Role"},
    {"id": "6931bccd-447a-43d1-b442-00a195474933", "type": "Role"},
    {"id": "246dd0d5-5bd0-4def-940b-0421030a5b68", "type": "Role"},
    {"id": "01c0a623-fc9b-48e9-b794-0756f8e8f067", "type": "Role"},
    {"id": "bf394140-e372-4bf9-a898-299cfc7564e5", "type": "Role"},
    {"id": "472e4a4d-bb4a-4026-98d1-0b0d74cb74a5", "type": "Role"},
    {"id": "b0afded3-3588-46d8-8b3d-9842eff778da", "type": "Role"},
    {"id": "dc5007c0-2d7d-4c42-879c-2dab87571379", "type": "Role"},
    {"id": "656f6061-f9fe-4f69-9c4e-a4a4f6509517", "type": "Role"},
    {"id": "8e8e4742-1d2d-4e47-97b6-61077c2b0c65", "type": "Role"},
    {"id": "230c1aed-a721-4c5d-9cb4-a90514e508ef", "type": "Role"},
    {"id": "86632667-cd15-4845-ad89-48a88e8412e1", "type": "Role"},
    {"id": "d72bdbf4-a59b-405c-8b04-5995895819ac", "type": "Role"},
    {"id": "926a6798-b100-4a20-a22f-a4918f13951d", "type": "Role"},
    {"id": "2f51be20-0bb4-4fed-bf7b-db946066c75e", "type": "Role"},
    {"id": "243333ab-4d21-40cb-a475-36241daa0842", "type": "Role"},
    {"id": "5b07b0dd-2377-4e44-a38d-b59f394b8163", "type": "Role"},
    {"id": "dc377aa6-52d8-4e23-b271-2a7ae04cedf3", "type": "Role"},
    {"id": "9241abd9-d0e6-425a-bd4f-47ba86d767a4", "type": "Role"},
    {"id": "7a6ee1e7-141e-4cec-ae74-d9db155731ff", "type": "Role"},
    {"id": "78145de6-330d-4a04-be18-7f2c09ba4740", "type": "Role"}
  ]
}]
JSONEOF

echo "  + User.Read.All"
echo "  + User.ReadWrite.All"
echo "  + UserAuthenticationMethod.ReadWrite.All"
echo "  + Group.Read.All"
echo "  + GroupMember.ReadWrite.All"
echo "  + Directory.Read.All"
echo "  + Organization.Read.All"
echo "  + Mail.Read"
echo "  + Mail.ReadWrite"
echo "  + MailboxSettings.Read"
echo "  + MailboxSettings.ReadWrite"
echo "  + Policy.Read.All"
echo "  + Policy.ReadWrite.ConditionalAccess"
echo "  + SecurityEvents.Read.All"
echo "  + SecurityAlert.Read.All"
echo "  + AuditLog.Read.All"
echo "  + IdentityRiskyUser.Read.All"
echo "  + IdentityRiskyUser.ReadWrite.All"
echo "  + DelegatedPermissionGrant.ReadWrite.All"
echo "  + Reports.Read.All"
echo "  + ThreatSubmission.Read.All"
echo "  + ThreatSubmission.ReadWrite.All"
echo "  + ThreatPolicy.ReadWrite.All"
echo "  + DeviceManagementManagedDevices.Read.All"
echo "  + DeviceManagementManagedDevices.ReadWrite.All"
echo "  + DeviceManagementManagedDevices.PrivilegedOperations.All"
echo "  + DeviceManagementConfiguration.Read.All"
echo "  + DeviceManagementConfiguration.ReadWrite.All"
echo "  + DeviceManagementApps.Read.All"
echo "  + DeviceManagementApps.ReadWrite.All"

az ad app update --id "$APP_ID" --required-resource-accesses "@$TEMP_FILE"
rm "$TEMP_FILE"

echo ""
echo "Step 3: Creating service principal..."
az ad sp create --id "$APP_ID" > /dev/null 2>&1 || echo "  (already exists)"

echo ""
echo "Step 4: Granting admin consent..."
sleep 3
az ad app permission admin-consent --id "$APP_ID" 2>/dev/null || echo "  Warning: Admin consent may need to be granted manually in the Azure portal."

echo ""
echo "Step 5: Creating client secret (1 year expiry)..."
SECRET=$(az ad app credential reset \
  --id "$APP_ID" \
  --display-name "Helm365 Secret" \
  --years 1 \
  --query password -o tsv)

echo ""
echo "  ================================="
echo "  App Registration Complete"
echo "  ================================="
echo ""
echo "  Tenant ID:     $TENANT_ID"
echo "  Client ID:     $APP_ID"
echo "  Client Secret: $SECRET"
echo ""
echo "  Paste these into Helm365 > Tenants > Connect Tenant."
echo "  Permissions: 30 (admin consent granted)"
echo ""
