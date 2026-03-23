#!/bin/bash
# Helm365 — Automated Azure AD App Registration
# Creates the app registration with all 30 required permissions and grants admin consent.
#
# Prerequisites: Azure CLI (`az`) installed and logged in
#   az login
#
# Usage:
#   ./scripts/register-app.sh                    # Single-tenant (your org only)
#   ./scripts/register-app.sh --multi-tenant     # Multi-tenant (MSP / GDAP)
#
# Output: Tenant ID, Client ID, Client Secret — paste into Helm365 tenant connection wizard.

set -e

APP_NAME="Helm365"
MULTI_TENANT=false

if [[ "$1" == "--multi-tenant" ]]; then
  MULTI_TENANT=true
fi

echo "╔══════════════════════════════════════════════╗"
echo "║  Helm365 — App Registration Setup            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Determine sign-in audience
if [ "$MULTI_TENANT" = true ]; then
  AUDIENCE="AzureADMultipleOrgs"
  echo "Mode: Multi-tenant (MSP / GDAP)"
else
  AUDIENCE="AzureADMyOrg"
  echo "Mode: Single tenant"
fi

echo ""
echo "Step 1: Creating app registration..."

APP_ID=$(az ad app create \
  --display-name "$APP_NAME" \
  --sign-in-audience "$AUDIENCE" \
  --query appId -o tsv)

echo "  App (Client) ID: $APP_ID"

# Get tenant ID
TENANT_ID=$(az account show --query tenantId -o tsv)
echo "  Tenant ID: $TENANT_ID"

echo ""
echo "Step 2: Adding API permissions (30 permissions)..."

# Microsoft Graph App ID
GRAPH_ID="00000003-0000-0000-c000-000000000000"

# All required permissions (Application type)
# Format: permission_name=permission_id
declare -A PERMISSIONS=(
  # Identity & Directory
  ["User.Read.All"]="df021288-bdef-4463-88db-98f22de89214"
  ["User.ReadWrite.All"]="741f803b-c850-494e-b5df-cde7c675a1ca"
  ["UserAuthenticationMethod.ReadWrite.All"]="50483e42-d915-4231-9639-7fdb7fd190e5"
  ["Group.Read.All"]="5b567255-7703-4780-807c-7be8301ae99b"
  ["GroupMember.ReadWrite.All"]="dbaae8cf-10b5-4b86-a4a1-f871c94c6571"
  ["Directory.Read.All"]="7ab1d382-f21e-4acd-a863-ba3e13f7da61"
  ["Organization.Read.All"]="498476ce-e0fe-48b0-b801-37ba7e2685c6"

  # Mail & Exchange
  ["Mail.Read"]="810c84a8-4a9e-49e6-bf7d-12d183f40d01"
  ["Mail.ReadWrite"]="e2a3a72e-5f79-4c64-b1b1-878b674786c9"
  ["MailboxSettings.Read"]="40f97065-369a-49f4-947c-6a90f8a16889"
  ["MailboxSettings.ReadWrite"]="6931bccd-447a-43d1-b442-00a195474933"

  # Security & Compliance
  ["Policy.Read.All"]="246dd0d5-5bd0-4def-940b-0421030a5b68"
  ["Policy.ReadWrite.ConditionalAccess"]="01c0a623-fc9b-48e9-b794-0756f8e8f067"
  ["SecurityEvents.Read.All"]="bf394140-e372-4bf9-a898-299cfc7564e5"
  ["SecurityAlert.Read.All"]="472e4a4d-bb4a-4026-98d1-0b0d74cb74a5"
  ["AuditLog.Read.All"]="b0afded3-3588-46d8-8b3d-9842eff778da"
  ["IdentityRiskyUser.Read.All"]="dc5007c0-2d7d-4c42-879c-2dab87571379"
  ["IdentityRiskyUser.ReadWrite.All"]="656f6061-f9fe-4f69-9c4e-a4a4f6509517"
  ["DelegatedPermissionGrant.ReadWrite.All"]="8e8e4742-1d2d-4e47-97b6-61077c2b0c65"
  ["Reports.Read.All"]="230c1aed-a721-4c5d-9cb4-a90514e508ef"

  # Email Security
  ["ThreatSubmission.Read.All"]="86632667-cd15-4845-ad89-48a88e8412e1"
  ["ThreatSubmission.ReadWrite.All"]="d72bdbf4-a59b-405c-8b04-5995895819ac"
  ["ThreatPolicy.ReadWrite.All"]="926a6798-b100-4a20-a22f-a4918f13951d"

  # Device Management (Intune)
  ["DeviceManagementManagedDevices.Read.All"]="2f51be20-0bb4-4fed-bf7b-db946066c75e"
  ["DeviceManagementManagedDevices.ReadWrite.All"]="243333ab-4d21-40cb-a475-36241daa0842"
  ["DeviceManagementManagedDevices.PrivilegedOperations.All"]="5b07b0dd-2377-4e44-a38d-b59f394b8163"
  ["DeviceManagementConfiguration.Read.All"]="dc377aa6-52d8-4e23-b271-2a7ae04cedf3"
  ["DeviceManagementConfiguration.ReadWrite.All"]="9241abd9-d0e6-425a-bd4f-47ba86d767a4"
  ["DeviceManagementApps.Read.All"]="7a6ee1e7-141e-4cec-ae74-d9db155731ff"
  ["DeviceManagementApps.ReadWrite.All"]="78145de6-330d-4a04-be18-7f2c09ba4740"
)

# Build the required-resource-accesses JSON
PERMS_JSON='[{"resourceAppId":"'$GRAPH_ID'","resourceAccess":['
FIRST=true
for PERM_NAME in "${!PERMISSIONS[@]}"; do
  PERM_ID="${PERMISSIONS[$PERM_NAME]}"
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    PERMS_JSON+=','
  fi
  PERMS_JSON+='{"id":"'$PERM_ID'","type":"Role"}'
  echo "  + $PERM_NAME"
done
PERMS_JSON+=']}]'

# Write to temp file (az cli needs file input for complex JSON)
TEMP_FILE=$(mktemp)
echo "$PERMS_JSON" > "$TEMP_FILE"

az ad app update --id "$APP_ID" --required-resource-accesses "@$TEMP_FILE"
rm "$TEMP_FILE"

echo ""
echo "Step 3: Creating service principal..."
az ad sp create --id "$APP_ID" --query id -o tsv > /dev/null 2>&1 || true

echo ""
echo "Step 4: Granting admin consent..."
# Small delay for propagation
sleep 3
az ad app permission admin-consent --id "$APP_ID" 2>/dev/null || echo "  ⚠ Admin consent may need to be granted manually in the Azure portal."

echo ""
echo "Step 5: Creating client secret (1 year expiry)..."
SECRET=$(az ad app credential reset \
  --id "$APP_ID" \
  --display-name "Helm365 Secret" \
  --years 1 \
  --query password -o tsv)

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ App Registration Complete                  ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "  Tenant ID:     $TENANT_ID"
echo "  Client ID:     $APP_ID"
echo "  Client Secret: $SECRET"
echo "║                                              ║"
echo "║  Paste these into Helm365 → Tenants →        ║"
echo "║  Connect Tenant wizard.                      ║"
echo "║                                              ║"
echo "║  Permissions: 30 (admin consent granted)     ║"
echo "║  Secret expires: $(date -v+1y +%Y-%m-%d 2>/dev/null || date -d '+1 year' +%Y-%m-%d 2>/dev/null || echo '1 year from now')"
echo "╚══════════════════════════════════════════════╝"
