#!/bin/bash
az group delete -n snake-rg --yes --no-wait
echo "Eliminación iniciada. Verifica en el portal que snake-rg y MC_snake-rg_* desaparezcan."