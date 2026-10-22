set -e
csv=$(ls /sim/data_model_*.csv | head -n1)
sed -i \
  -e "s|^\(InternetGatewayDevice\.ManagementServer\.Username,[^,]*,[^,]*,\)[^,]*|\1${CWMP_USER}|" \
  -e "s|^\(InternetGatewayDevice\.ManagementServer\.Password,[^,]*,[^,]*,\)[^,]*|\1${CWMP_PASS}|" \
  "$csv"
exec node genieacs-sim -u "${ACS_URL}" -s "${SERIAL_OFFSET}"
