import type { AgentTool } from '@/agents/types';

export const DEVICE_TOOLS: AgentTool[] = [
  // --- GREEN ---
  {
    name: 'graph_list_managed_devices',
    description: 'List Intune-managed devices with compliance status, OS, last sync, and enrollment date.',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'OData filter (e.g., complianceState eq "noncompliant")' },
        userId: { type: 'string', description: 'Filter by device owner' },
        top: { type: 'number', description: 'Max results (default 25)' },
      },
    },
    tier: 'green', agent: 'device',
    graphEndpoint: '/deviceManagement/managedDevices', method: 'GET',
    requiredPermissions: ['DeviceManagementManagedDevices.Read.All'],
  },
  {
    name: 'graph_get_device',
    description: 'Get detailed info about a specific managed device.',
    parameters: {
      type: 'object',
      properties: { deviceId: { type: 'string', description: 'Managed device ID' } },
      required: ['deviceId'],
    },
    tier: 'green', agent: 'device',
    graphEndpoint: '/deviceManagement/managedDevices/{deviceId}', method: 'GET',
    requiredPermissions: ['DeviceManagementManagedDevices.Read.All'],
  },
  {
    name: 'graph_list_compliance_policies',
    description: 'List device compliance policies configured in Intune.',
    parameters: { type: 'object', properties: {} },
    tier: 'green', agent: 'device',
    graphEndpoint: '/deviceManagement/deviceCompliancePolicies', method: 'GET',
    requiredPermissions: ['DeviceManagementConfiguration.Read.All'],
  },
  {
    name: 'graph_list_config_profiles',
    description: 'List device configuration profiles in Intune.',
    parameters: { type: 'object', properties: {} },
    tier: 'green', agent: 'device',
    graphEndpoint: '/deviceManagement/deviceConfigurations', method: 'GET',
    requiredPermissions: ['DeviceManagementConfiguration.Read.All'],
  },
  {
    name: 'graph_list_noncompliant_devices',
    description: 'List all devices that are not compliant with Intune policies. Shows device name, user, OS, and which policies failed.',
    parameters: {
      type: 'object',
      properties: { top: { type: 'number', description: 'Max results (default 50)' } },
    },
    tier: 'green', agent: 'device',
    graphEndpoint: '/deviceManagement/managedDevices', method: 'GET',
    requiredPermissions: ['DeviceManagementManagedDevices.Read.All'],
  },
  {
    name: 'graph_list_apps',
    description: 'List mobile and desktop apps managed by Intune.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['win32', 'ios', 'android', 'web', 'all'], description: 'Filter by app type' },
      },
    },
    tier: 'green', agent: 'device',
    graphEndpoint: '/deviceAppManagement/mobileApps', method: 'GET',
    requiredPermissions: ['DeviceManagementApps.Read.All'],
  },

  // --- YELLOW ---
  {
    name: 'graph_sync_device',
    description: 'Trigger a sync for a managed device to pull latest policies and configurations.',
    parameters: {
      type: 'object',
      properties: { deviceId: { type: 'string', description: 'Device ID to sync' } },
      required: ['deviceId'],
    },
    tier: 'yellow', agent: 'device',
    graphEndpoint: '/deviceManagement/managedDevices/{deviceId}/syncDevice', method: 'POST',
    requiredPermissions: ['DeviceManagementManagedDevices.ReadWrite.All'],
  },
  {
    name: 'graph_deploy_app',
    description: 'Assign an Intune app to a group of users or devices.',
    parameters: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'App ID' },
        groupId: { type: 'string', description: 'Target group ID' },
        intent: { type: 'string', enum: ['required', 'available', 'uninstall'], description: 'Assignment intent' },
      },
      required: ['appId', 'groupId', 'intent'],
    },
    tier: 'yellow', agent: 'device',
    graphEndpoint: '/deviceAppManagement/mobileApps/{appId}/assignments', method: 'POST',
    requiredPermissions: ['DeviceManagementApps.ReadWrite.All'],
  },
  {
    name: 'graph_run_remediation',
    description: 'Run a proactive remediation script on a device or device group.',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Remediation script ID' },
        groupId: { type: 'string', description: 'Target group (omit for all devices)' },
      },
      required: ['scriptId'],
    },
    tier: 'yellow', agent: 'device',
    requiredPermissions: ['DeviceManagementConfiguration.ReadWrite.All'],
  },

  // --- RED ---
  {
    name: 'graph_wipe_device',
    description: 'Factory reset a managed device. DESTRUCTIVE — all data on the device will be erased.',
    parameters: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'Device ID to wipe' },
        keepUserData: { type: 'boolean', description: 'Keep user data (selective wipe) vs full wipe' },
      },
      required: ['deviceId'],
    },
    tier: 'red', agent: 'device',
    graphEndpoint: '/deviceManagement/managedDevices/{deviceId}/wipe', method: 'POST',
    requiredPermissions: ['DeviceManagementManagedDevices.PrivilegedOperations.All'],
  },
  {
    name: 'graph_retire_device',
    description: 'Retire a device — removes company data but keeps personal data. Less destructive than wipe.',
    parameters: {
      type: 'object',
      properties: { deviceId: { type: 'string', description: 'Device ID' } },
      required: ['deviceId'],
    },
    tier: 'red', agent: 'device',
    graphEndpoint: '/deviceManagement/managedDevices/{deviceId}/retire', method: 'POST',
    requiredPermissions: ['DeviceManagementManagedDevices.PrivilegedOperations.All'],
  },
];
