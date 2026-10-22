const IGD = "InternetGatewayDevice";
const DEV = "Device";

const SCALARS = {
  softwareVersion: [`${IGD}.DeviceInfo.SoftwareVersion`, `${DEV}.DeviceInfo.SoftwareVersion`],
  hardwareVersion: [`${IGD}.DeviceInfo.HardwareVersion`, `${DEV}.DeviceInfo.HardwareVersion`],
  modelName: [`${IGD}.DeviceInfo.ModelName`, `${DEV}.DeviceInfo.ModelName`],
  uptime: [`${IGD}.DeviceInfo.UpTime`, `${DEV}.DeviceInfo.UpTime`],
  informInterval: [`${IGD}.ManagementServer.PeriodicInformInterval`, `${DEV}.ManagementServer.PeriodicInformInterval`],
  connectionRequestUrl: [`${IGD}.ManagementServer.ConnectionRequestURL`, `${DEV}.ManagementServer.ConnectionRequestURL`]
};

const OPTICAL = {
  rxPower: {
    paths: [
      `${IGD}.WANDevice.*.X_GponInterafceConfig.RXPower`,
      `${IGD}.WANDevice.*.X_HW_GponInterfaceConfig.RXPower`,
      `${IGD}.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.RXPower`,
      `${IGD}.WANDevice.*.X_CT-COM_GponInterfaceConfig.RXPower`,
      `${IGD}.WANDevice.*.X_CT-COM_EponInterfaceConfig.RXPower`,
      `${IGD}.WANDevice.*.X_CU_WANGPONInterfaceConfig.OpticalTransceiver.RXPower`,
      `${IGD}.X_ALU_OntOpticalParam.RxPower`,
      `${DEV}.Optical.Interface.*.OpticalSignalLevel`
    ],
    match: /(rx_?power|rxoptical|opticalsignallevel|receivepower)$/i
  },
  txPower: {
    paths: [
      `${IGD}.WANDevice.*.X_GponInterafceConfig.TXPower`,
      `${IGD}.WANDevice.*.X_HW_GponInterfaceConfig.TXPower`,
      `${IGD}.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.TXPower`,
      `${IGD}.WANDevice.*.X_CT-COM_GponInterfaceConfig.TXPower`,
      `${IGD}.WANDevice.*.X_CT-COM_EponInterfaceConfig.TXPower`,
      `${IGD}.WANDevice.*.X_CU_WANGPONInterfaceConfig.OpticalTransceiver.TXPower`,
      `${IGD}.X_ALU_OntOpticalParam.TxPower`,
      `${DEV}.Optical.Interface.*.TransmitOpticalLevel`
    ],
    match: /(tx_?power|txoptical|transmitopticallevel|transmitpower)$/i
  }
};

const OPTICAL_MODULE = [
  `${IGD}.WANDevice.*.X_CT-COM_EponInterfaceConfig`,
  `${IGD}.WANDevice.*.X_CT-COM_GponInterfaceConfig`,
  `${IGD}.WANDevice.*.X_CU_WANEPONInterfaceConfig`,
  `${IGD}.WANDevice.*.X_CU_WANGPONInterfaceConfig.OpticalTransceiver`
];

const ROOTS = {
  [IGD]: {
    wanConnections: [`${IGD}.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*`, `${IGD}.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*`],
    wlan: `${IGD}.LANDevice.*.WLANConfiguration.*`,
    hosts: `${IGD}.LANDevice.*.Hosts.Host.*`,
    lanPorts: `${IGD}.LANDevice.*.LANEthernetInterfaceConfig.*`,
    ping: `${IGD}.IPPingDiagnostics`,
    download: `${IGD}.DownloadDiagnostics`,
    refresh: {
      summary: [`${IGD}.DeviceInfo`, `${IGD}.ManagementServer`, `${IGD}.WANDevice`],
      clients: [`${IGD}.LANDevice`]
    }
  },
  [DEV]: {
    pppInterfaces: `${DEV}.PPP.Interface.*`,
    ipInterfaces: `${DEV}.IP.Interface.*`,
    ssids: `${DEV}.WiFi.SSID.*`,
    radios: `${DEV}.WiFi.Radio.*`,
    accessPoints: `${DEV}.WiFi.AccessPoint.*`,
    hosts: `${DEV}.Hosts.Host.*`,
    lanPorts: `${DEV}.Ethernet.Interface.*`,
    ping: `${DEV}.IP.Diagnostics.IPPing`,
    download: `${DEV}.IP.Diagnostics.DownloadDiagnostics`,
    refresh: {
      summary: [`${DEV}.DeviceInfo`, `${DEV}.ManagementServer`, `${DEV}.PPP`, `${DEV}.IP`, `${DEV}.Optical`],
      clients: [`${DEV}.Hosts`, `${DEV}.WiFi`, `${DEV}.Ethernet`]
    }
  }
};

module.exports = { SCALARS, OPTICAL, OPTICAL_MODULE, ROOTS };
