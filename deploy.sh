#!/bin/bash
set -e
RG=snake-rg
LOC=${LOC:-westus}            # cámbiala por una región permitida en tu cuenta
SIZE=${SIZE:-Standard_B2s}    # cámbiala si no está disponible

: "${DATABASE_URL:?Define DATABASE_URL antes de ejecutar}"

echo ">> Creando grupo de recursos y clúster..."
az group create -n $RG -l $LOC -o none
az aks create -g $RG -n snake-aks --tier free \
  --node-count 1 --node-vm-size $SIZE --generate-ssh-keys -o none
az aks get-credentials -g $RG -n snake-aks --overwrite-existing

echo ">> Instalando balanceador (NGINX Ingress)..."
helm upgrade --install ingress-nginx ingress-nginx \
  --repo https://kubernetes.github.io/ingress-nginx \
  -n ingress-nginx --create-namespace \
  --set controller.replicaCount=1 \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz \
  --wait

echo ">> Desplegando el juego..."
kubectl delete secret db-secret --ignore-not-found
kubectl create secret generic db-secret --from-literal=url="$DATABASE_URL"
kubectl apply -f k8s/snake.yaml
kubectl rollout status deployment/snake --timeout=180s

echo ">> Esperando IP pública..."
until IP=$(kubectl get svc ingress-nginx-controller -n ingress-nginx \
      -o jsonpath='{.status.loadBalancer.ingress[0].ip}') && [ -n "$IP" ]; do sleep 10; done
echo ""
echo "=========================================="
echo " JUEGO LISTO:  http://$IP"
echo "=========================================="
kubectl get pods -o wide