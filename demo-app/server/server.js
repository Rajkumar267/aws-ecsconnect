import express from 'express';
import cors from 'cors';
import {
  ECSClient,
  DescribeServicesCommand,
  ListTasksCommand,
  DescribeTasksCommand,
  StopTaskCommand
} from '@aws-sdk/client-ecs';
import {
  EC2Client,
  DescribeNetworkInterfacesCommand
} from '@aws-sdk/client-ec2';

const app = express();
const PORT = process.env.PORT || 3001;
const REGION = process.env.AWS_REGION || 'eu-north-1';
const CLUSTER = process.env.ECS_CLUSTER || 'ecs-service-connect-demo';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../client/dist');

app.use(cors());
app.use(express.json());
app.use(express.static(distPath));

const ecs = new ECSClient({ region: REGION });
const ec2 = new EC2Client({ region: REGION });

// In-memory cache for discovered endpoints
let endpointCache = {
  lastUpdated: 0,
  order: null,
  product: null,
  payment: null
};

// Helper to extract ENI details and public IP
async function getTaskNetworkInfo(task) {
  const eniAttachment = task.attachments?.find(
    (att) => att.type === 'ElasticNetworkInterface'
  );
  if (!eniAttachment) return { privateIp: null, publicIp: null, eniId: null };

  const privateIpDetail = eniAttachment.details?.find(
    (d) => d.name === 'privateIPv4Address'
  );
  const eniIdDetail = eniAttachment.details?.find(
    (d) => d.name === 'networkInterfaceId'
  );

  const privateIp = privateIpDetail?.value || null;
  const eniId = eniIdDetail?.value || null;
  let publicIp = null;

  if (eniId) {
    try {
      const ec2Res = await ec2.send(
        new DescribeNetworkInterfacesCommand({
          NetworkInterfaceIds: [eniId]
        })
      );
      publicIp = ec2Res.NetworkInterfaces?.[0]?.Association?.PublicIp || null;
    } catch (err) {
      console.warn(`Could not fetch public IP for ENI ${eniId}:`, err.message);
    }
  }

  return { privateIp, publicIp, eniId };
}

// Discover real endpoints of running ECS services
async function discoverEndpoints(force = false) {
  const now = Date.now();
  if (!force && now - endpointCache.lastUpdated < 15000 && endpointCache.order && endpointCache.product && endpointCache.payment) {
    return endpointCache;
  }

  try {
    const servicesRes = await ecs.send(
      new DescribeServicesCommand({
        cluster: CLUSTER,
        services: ['order-service', 'product-service', 'payment-service']
      })
    );

    const services = servicesRes.services || [];

    await Promise.all(
      services.map(async (service) => {
        const serviceName = service.serviceName;
        const tasksRes = await ecs.send(
          new ListTasksCommand({
            cluster: CLUSTER,
            serviceName: serviceName,
            desiredStatus: 'RUNNING'
          })
        );

        const taskArns = tasksRes.taskArns || [];
        if (taskArns.length === 0) return;

        const descTasksRes = await ecs.send(
          new DescribeTasksCommand({
            cluster: CLUSTER,
            tasks: [taskArns[0]]
          })
        );

        const task = descTasksRes.tasks?.[0];
        if (!task) return;

        const taskId = task.taskArn.split('/').pop();
        const { privateIp, publicIp } = await getTaskNetworkInfo(task);

        const info = {
          name: serviceName,
          status: task.lastStatus,
          desiredStatus: task.desiredStatus,
          taskId,
          privateIp,
          publicIp
        };

        if (serviceName === 'order-service') {
          info.port = 8080;
          info.logicalName = 'order-service:8080';
          info.url = publicIp ? `http://${publicIp}:8080` : null;
          endpointCache.order = info;
        } else if (serviceName === 'product-service') {
          info.port = 8081;
          info.logicalName = 'product-service:8081';
          info.url = publicIp ? `http://${publicIp}:8081` : null;
          endpointCache.product = info;
        } else if (serviceName === 'payment-service') {
          info.port = 8082;
          info.logicalName = 'payment-service:8082';
          info.url = publicIp ? `http://${publicIp}:8082` : null;
          endpointCache.payment = info;
        }
      })
    );

    endpointCache.lastUpdated = now;
  } catch (err) {
    console.error('Error discovering endpoints:', err);
  }

  return endpointCache;
}

// GET /api/status - Retrieve full real ECS and Service Connect state
app.get('/api/status', async (req, res) => {
  try {
    const endpoints = await discoverEndpoints(req.query.refresh === 'true');

    res.json({
      cluster: CLUSTER,
      region: REGION,
      namespace: 'microservices',
      services: {
        order: endpoints.order || { name: 'order-service', status: 'UNKNOWN', logicalName: 'order-service:8080' },
        product: endpoints.product || { name: 'product-service', status: 'UNKNOWN', logicalName: 'product-service:8081' },
        payment: endpoints.payment || { name: 'payment-service', status: 'UNKNOWN', logicalName: 'payment-service:8082' }
      },
      productTask: endpoints.product ? {
        taskId: endpoints.product.taskId,
        privateIp: endpoints.product.privateIp,
        publicIp: endpoints.product.publicIp,
        status: endpoints.product.status
      } : null,
      serviceConnect: {
        enabled: true,
        namespace: 'microservices',
        endpoints: [
          { service: 'order-service', dns: 'order-service:8080' },
          { service: 'product-service', dns: 'product-service:8081' },
          { service: 'payment-service', dns: 'payment-service:8082' }
        ]
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve ECS status', details: err.message });
  }
});

// GET /api/products - Get all products from Product Service
app.get('/api/products', async (req, res) => {
  try {
    const endpoints = await discoverEndpoints();
    if (!endpoints.product?.url) {
      return res.status(503).json({ error: 'Product Service unavailable or public endpoint not found' });
    }

    const response = await fetch(`${endpoints.product.url}/products`);
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error connecting to Product Service', details: err.message });
  }
});

// POST /api/products - Create a new product
app.post('/api/products', async (req, res) => {
  try {
    const { name, price, stock } = req.body;
    if (!name || price === undefined || stock === undefined) {
      return res.status(400).json({ error: 'Missing product fields (name, price, stock)' });
    }

    const endpoints = await discoverEndpoints();
    if (!endpoints.product?.url) {
      return res.status(503).json({ error: 'Product Service unavailable' });
    }

    const response = await fetch(`${endpoints.product.url}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price: Number(price), stock: Number(stock) })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error creating product', details: err.message });
  }
});

// POST /api/orders - Place a new order (Triggers Order -> Product -> Payment flow)
app.post('/api/orders', async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || !quantity) {
      return res.status(400).json({ error: 'Missing productId or quantity' });
    }

    const endpoints = await discoverEndpoints();
    if (!endpoints.order?.url) {
      return res.status(503).json({ error: 'Order Service unavailable' });
    }

    const response = await fetch(`${endpoints.order.url}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: Number(productId), quantity: Number(quantity) })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const order = await response.json();

    // Optionally retrieve the payment record created for this order
    let payment = null;
    if (endpoints.payment?.url && order.id) {
      try {
        const payRes = await fetch(`${endpoints.payment.url}/payments/${order.id}`);
        if (payRes.ok) {
          payment = await payRes.json();
        }
      } catch (pErr) {
        console.warn('Payment fetch warning:', pErr.message);
      }
    }

    res.status(201).json({
      ...order,
      payment: payment || { status: 'SUCCESS' }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error placing order', details: err.message });
  }
});

// GET /api/orders - Get all orders
app.get('/api/orders', async (req, res) => {
  try {
    const endpoints = await discoverEndpoints();
    if (!endpoints.order?.url) {
      return res.status(503).json({ error: 'Order Service unavailable' });
    }

    const response = await fetch(`${endpoints.order.url}/orders`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching orders', details: err.message });
  }
});

// GET /api/payments - Get all payments
app.get('/api/payments', async (req, res) => {
  try {
    const endpoints = await discoverEndpoints();
    if (!endpoints.payment?.url) {
      return res.status(503).json({ error: 'Payment Service unavailable' });
    }

    const response = await fetch(`${endpoints.payment.url}/payments`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching payments', details: err.message });
  }
});

// POST /api/demo/replace-product - Real ECS task replacement
app.post('/api/demo/replace-product', async (req, res) => {
  try {
    console.log('Initiating real Product Service task replacement demonstration...');

    // 1. Find currently running Product ECS task
    const listTasksRes = await ecs.send(
      new ListTasksCommand({
        cluster: CLUSTER,
        serviceName: 'product-service',
        desiredStatus: 'RUNNING'
      })
    );

    const taskArns = listTasksRes.taskArns || [];
    if (taskArns.length === 0) {
      return res.status(404).json({ error: 'No running Product Service task found' });
    }

    const oldTaskArn = taskArns[0];
    const oldTaskId = oldTaskArn.split('/').pop();

    const descOldTaskRes = await ecs.send(
      new DescribeTasksCommand({
        cluster: CLUSTER,
        tasks: [oldTaskArn]
      })
    );
    const oldTask = descOldTaskRes.tasks?.[0];
    const oldNetwork = await getTaskNetworkInfo(oldTask);
    const oldPrivateIp = oldNetwork.privateIp || 'Unknown';

    console.log(`Stopping Product task: ${oldTaskId} (Private IP: ${oldPrivateIp})`);

    // 2. Stop ONLY that Product task
    await ecs.send(
      new StopTaskCommand({
        cluster: CLUSTER,
        task: oldTaskArn,
        reason: 'ECS Service Connect Demo: Task Replacement Triggered'
      })
    );

    // 3. Wait for ECS service to launch the replacement task and reach RUNNING
    let newTaskId = null;
    let newPrivateIp = null;
    let newPublicIp = null;
    const startTime = Date.now();
    const timeoutMs = 90000; // 90 seconds timeout

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 3500));

      const pollTasksRes = await ecs.send(
        new ListTasksCommand({
          cluster: CLUSTER,
          serviceName: 'product-service',
          desiredStatus: 'RUNNING'
        })
      );

      const currentTasks = pollTasksRes.taskArns || [];
      const potentialNewTask = currentTasks.find((arn) => !arn.includes(oldTaskId));

      if (potentialNewTask) {
        const descNewRes = await ecs.send(
          new DescribeTasksCommand({
            cluster: CLUSTER,
            tasks: [potentialNewTask]
          })
        );
        const newTask = descNewRes.tasks?.[0];

        if (newTask && newTask.lastStatus === 'RUNNING') {
          const networkInfo = await getTaskNetworkInfo(newTask);
          if (networkInfo.privateIp) {
            newTaskId = potentialNewTask.split('/').pop();
            newPrivateIp = networkInfo.privateIp;
            newPublicIp = networkInfo.publicIp;

            // Wait for Spring Boot to finish initialization and respond
            if (newPublicIp) {
              console.log(`Waiting for Product Service container (${newPublicIp}:8081) to be ready...`);
              for (let i = 0; i < 15; i++) {
                try {
                  const testRes = await fetch(`http://${newPublicIp}:8081/products`, { signal: AbortSignal.timeout(2000) });
                  if (testRes.ok) {
                    console.log(`Product Service is ready and responding on port 8081!`);
                    break;
                  }
                } catch (e) {
                  // Container still warming up
                }
                await new Promise((r) => setTimeout(r, 2000));
              }
            }
            break;
          }
        }
      }
    }

    if (!newTaskId) {
      return res.status(504).json({
        error: 'Replacement task did not reach RUNNING within the expected time',
        oldTaskId,
        oldPrivateIp
      });
    }

    console.log(`Replacement task is active: ${newTaskId} (Private IP: ${newPrivateIp})`);

    // Refresh endpoints cache with new task
    await discoverEndpoints(true);

    res.json({
      success: true,
      oldTaskId,
      oldPrivateIp,
      newTaskId,
      newPrivateIp,
      newPublicIp,
      status: 'RUNNING',
      serviceConnectEndpoint: 'product-service:8081',
      message: 'Product task replaced successfully. Service Connect continues resolving product-service:8081 to the new task.'
    });
  } catch (err) {
    console.error('Error during task replacement:', err);
    res.status(500).json({ error: 'Failed to replace product task', details: err.message });
  }
});

// Fallback for SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`ECS Service Connect Demo Backend running on port ${PORT}`);
  console.log(`Targeting Cluster: ${CLUSTER} in ${REGION}`);
  console.log(`Discovering initial ECS service endpoints...`);
  await discoverEndpoints(true);
  console.log(`Discovery complete:`);
  console.log(` - Order:   ${endpointCache.order?.url || 'N/A'} (Private: ${endpointCache.order?.privateIp || 'N/A'})`);
  console.log(` - Product: ${endpointCache.product?.url || 'N/A'} (Private: ${endpointCache.product?.privateIp || 'N/A'})`);
  console.log(` - Payment: ${endpointCache.payment?.url || 'N/A'} (Private: ${endpointCache.payment?.privateIp || 'N/A'})`);
  console.log(`====================================================`);
});
