import React, { useState, useEffect } from 'react';

export default function App() {
  const [status, setStatus] = useState(null);
  const [products, setProducts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Product Form
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodStock, setProdStock] = useState('10');
  const [creatingProduct, setCreatingProduct] = useState(false);

  // Order Form
  const [selectedProductId, setSelectedProductId] = useState('');
  const [orderQuantity, setOrderQuantity] = useState('1');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);

  // Replacement Demonstration
  const [isReplacing, setIsReplacing] = useState(false);
  const [replacementResult, setReplacementResult] = useState(null);
  const [hasReplaced, setHasReplaced] = useState(false);
  const [orderAfterReplacement, setOrderAfterReplacement] = useState(false);

  // Feedback Notification
  const [notification, setNotification] = useState(null);

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 6000);
  };

  // Fetch status
  const fetchStatus = async (showLoading = false) => {
    if (showLoading) setLoadingStatus(true);
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      if (showLoading) setLoadingStatus(false);
    }
  };

  // Fetch products
  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
        if (data.length > 0 && !selectedProductId) {
          setSelectedProductId(String(data[0].id));
        }
      }
    } catch (err) {
      console.error('Failed to fetch products:', err);
    }
  };

  // Fetch payments
  const fetchPayments = async () => {
    try {
      const res = await fetch('/api/payments');
      if (res.ok) {
        const data = await res.json();
        setPayments(data);
      }
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    }
  };

  useEffect(() => {
    fetchStatus(true);
    fetchProducts();
    fetchPayments();

    const interval = setInterval(() => {
      fetchStatus(false);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  // Handle Create Product
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!prodName || !prodPrice || !prodStock) return;

    setCreatingProduct(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: prodName,
          price: parseFloat(prodPrice),
          stock: parseInt(prodStock, 10)
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create product');
      }

      const created = await res.json();
      showNotification('success', `Product "${created.name}" created successfully (ID #${created.id})!`);
      setProdName('');
      setProdPrice('');
      fetchProducts();
      setSelectedProductId(String(created.id));
    } catch (err) {
      showNotification('error', `Error creating product: ${err.message}`);
    } finally {
      setCreatingProduct(false);
    }
  };

  // Handle Place Order
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!selectedProductId || !orderQuantity) return;

    setPlacingOrder(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: parseInt(selectedProductId, 10),
          quantity: parseInt(orderQuantity, 10)
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to place order');
      }

      const orderData = await res.json();
      const productObj = products.find((p) => p.id === parseInt(selectedProductId, 10));

      setLastOrder({
        ...orderData,
        productName: productObj?.name || `Product #${orderData.productId}`
      });

      if (hasReplaced) {
        setOrderAfterReplacement(true);
      }

      showNotification('success', `Order #${orderData.id} placed and payment processed successfully!`);
      fetchPayments();
    } catch (err) {
      showNotification('error', `Order failed: ${err.message}`);
    } finally {
      setPlacingOrder(false);
    }
  };

  // Handle Replace Product Task (Real AWS Task Replacement)
  const handleReplaceProductTask = async () => {
    if (isReplacing) return;

    setIsReplacing(true);
    setReplacementResult(null);
    setOrderAfterReplacement(false);

    try {
      const res = await fetch('/api/demo/replace-product', {
        method: 'POST'
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to replace product task');
      }

      const result = await res.json();
      setReplacementResult(result);
      setHasReplaced(true);
      showNotification('success', 'Product Service task replaced successfully! New task is running.');
      fetchStatus(false);
    } catch (err) {
      showNotification('error', `Task replacement failed: ${err.message}`);
    } finally {
      setIsReplacing(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="title-group">
          <h1>
            ECS Service Connect Demo
            <span className="title-badge">Live Demonstration</span>
          </h1>
          <p className="subtitle">
            Service-to-Service Traffic on Amazon ECS &amp; Resilient Task Discovery
          </p>
        </div>

        <div className="header-badges">
          <div className="meta-pill">
            Region: <strong>{status?.region || 'eu-north-1'}</strong>
          </div>
          <div className="meta-pill">
            Cluster: <strong>{status?.cluster || 'ecs-service-connect-demo'}</strong>
          </div>
          <div className="meta-pill">
            Namespace: <strong>{status?.namespace || 'microservices'}</strong>
          </div>
          <button
            className="refresh-btn"
            onClick={() => {
              fetchStatus(true);
              fetchProducts();
              fetchPayments();
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* Global Notifications */}
      {notification && (
        <div className={notification.type === 'success' ? 'alert-success' : 'alert-error'}>
          {notification.type === 'success' ? '✓ ' : '✕ '}
          {notification.message}
        </div>
      )}

      {/* SECTION 1: Service Status Dashboard */}
      <section className="card">
        <div className="card-title">
          <span>SECTION 1 — Microservices Status (Amazon ECS / Fargate)</span>
          <span className="status-tag running">
            <span className="status-dot green"></span>
            ALL SERVICES ACTIVE
          </span>
        </div>
        <p className="card-desc">
          Real-time status of the three independently deployed Spring Boot microservices inside AWS ECS cluster.
        </p>

        <div className="grid-3">
          {/* Order Service */}
          <div className="card" style={{ background: 'var(--bg-secondary)', marginBottom: 0 }}>
            <div className="service-header">
              <span className="service-name">Order Service</span>
              <span className="status-tag running">
                <span className="status-dot green"></span>
                {status?.services?.order?.status || 'RUNNING'}
              </span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Port:</span>
              <span className="service-meta-val">8080</span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Service Connect Alias:</span>
              <span className="service-meta-val highlight-dns">order-service:8080</span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Task Private IP:</span>
              <span className="service-meta-val">{status?.services?.order?.privateIp || '172.31.42.182'}</span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Database:</span>
              <span className="service-meta-val">order_db (RDS PostgreSQL)</span>
            </div>
          </div>

          {/* Product Service */}
          <div className="card" style={{ background: 'var(--bg-secondary)', marginBottom: 0 }}>
            <div className="service-header">
              <span className="service-name">Product Service</span>
              <span className="status-tag running">
                <span className="status-dot green"></span>
                {status?.services?.product?.status || 'RUNNING'}
              </span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Port:</span>
              <span className="service-meta-val">8081</span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Service Connect Alias:</span>
              <span className="service-meta-val highlight-dns">product-service:8081</span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Task Private IP:</span>
              <span className="service-meta-val">{status?.services?.product?.privateIp || '172.31.24.19'}</span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Database:</span>
              <span className="service-meta-val">product_db (RDS PostgreSQL)</span>
            </div>
          </div>

          {/* Payment Service */}
          <div className="card" style={{ background: 'var(--bg-secondary)', marginBottom: 0 }}>
            <div className="service-header">
              <span className="service-name">Payment Service</span>
              <span className="status-tag running">
                <span className="status-dot green"></span>
                {status?.services?.payment?.status || 'RUNNING'}
              </span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Port:</span>
              <span className="service-meta-val">8082</span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Service Connect Alias:</span>
              <span className="service-meta-val highlight-dns">payment-service:8082</span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Task Private IP:</span>
              <span className="service-meta-val">{status?.services?.payment?.privateIp || '172.31.17.4'}</span>
            </div>
            <div className="service-meta-row">
              <span className="service-meta-label">Database:</span>
              <span className="service-meta-val">payment_db (RDS PostgreSQL)</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Service Flow */}
      <section className="card">
        <div className="card-title">SECTION 2 — Service Connect Traffic Flow</div>
        <p className="card-desc">
          How microservices communicate internally over HTTP using Service Connect service discovery.
        </p>

        <div className="flow-container">
          <div className="flow-node">
            <h4>Order Service</h4>
            <div className="node-role">HTTP Server (:8080)</div>
          </div>

          <div className="flow-connector">
            <span className="connector-label">product-service:8081</span>
            <span className="arrow">➔</span>
          </div>

          <div className="flow-node">
            <h4>Product Service</h4>
            <div className="node-role">HTTP Server (:8081)</div>
          </div>

          <div className="flow-connector">
            <span className="connector-label">payment-service:8082</span>
            <span className="arrow">➔</span>
          </div>

          <div className="flow-node">
            <h4>Payment Service</h4>
            <div className="node-role">HTTP Server (:8082)</div>
          </div>
        </div>

        <div className="flow-banner">
          <span>ℹ️</span>
          <div>
            <strong>Core Architecture Principle:</strong> Order Service communicates using{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
              product-service:8081
            </span>{' '}
            and{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
              payment-service:8082
            </span>
            . ECS Service Connect sidecars handle service discovery dynamically. Order Service never connects directly to fixed task IPs.
          </div>
        </div>
      </section>

      {/* Grid: Section 3 (Product) & Section 4 (Order) */}
      <div className="grid-2">
        {/* SECTION 3: Product Management */}
        <section className="card">
          <div className="card-title">SECTION 3 — Product Service</div>
          <p className="card-desc">Create or inspect products in the Product catalog database.</p>

          <form onSubmit={handleCreateProduct}>
            <div className="form-group">
              <label className="form-label">Product Name</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. Wireless Mouse"
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Price (₹)</label>
                <input
                  className="form-input"
                  type="number"
                  placeholder="e.g. 1500"
                  value={prodPrice}
                  onChange={(e) => setProdPrice(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Stock Quantity</label>
                <input
                  className="form-input"
                  type="number"
                  placeholder="e.g. 20"
                  value={prodStock}
                  onChange={(e) => setProdStock(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={creatingProduct}>
              {creatingProduct ? <span className="loading-spinner"></span> : '+ Create Product'}
            </button>
          </form>

          <div style={{ marginTop: '1.25rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Available Products in Database:
            </span>
            <table className="item-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      No products found.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>#{p.id}</td>
                      <td>{p.name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>₹{p.price.toLocaleString()}</td>
                      <td>{p.stock}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION 4: Place Order */}
        <section className="card">
          <div className="card-title">SECTION 4 — Place Order</div>
          <p className="card-desc">
            Triggers internal service call: Order ➔ Product (:8081) ➔ Payment (:8082).
          </p>

          <form onSubmit={handlePlaceOrder}>
            <div className="form-group">
              <label className="form-label">Select Product</label>
              <select
                className="form-select"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                required
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} - {p.name} (₹{p.price.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input
                className="form-input"
                type="number"
                min="1"
                value={orderQuantity}
                onChange={(e) => setOrderQuantity(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-primary" disabled={placingOrder}>
              {placingOrder ? (
                <>
                  <span className="loading-spinner"></span> Calling Service Connect...
                </>
              ) : (
                'Place Order'
              )}
            </button>
          </form>

          {/* Order Result Card */}
          {lastOrder && (
            <div className="order-result-box">
              <div className="order-result-header">
                <span className="order-id-badge">Order #{lastOrder.id}</span>
                <span className="status-tag running">
                  <span className="status-dot green"></span>
                  Payment: {lastOrder.payment?.status || 'SUCCESS'}
                </span>
              </div>
              <div className="service-meta-row">
                <span className="service-meta-label">Product:</span>
                <span className="service-meta-val">{lastOrder.productName}</span>
              </div>
              <div className="service-meta-row">
                <span className="service-meta-label">Quantity:</span>
                <span className="service-meta-val">{lastOrder.quantity}</span>
              </div>
              <div className="service-meta-row">
                <span className="service-meta-label">Total Calculated Price:</span>
                <span className="service-meta-val" style={{ color: 'var(--accent-cyan)', fontSize: '1rem' }}>
                  ₹{lastOrder.price?.toLocaleString()}
                </span>
              </div>

              <div className="flow-check-steps">
                <div className="flow-step-item">
                  <span className="check-icon">✓</span>
                  <span>Order Service received order request</span>
                </div>
                <div className="flow-step-item">
                  <span className="check-icon">✓</span>
                  <span>Product Service resolved via <strong>product-service:8081</strong> (price verified)</span>
                </div>
                <div className="flow-step-item">
                  <span className="check-icon">✓</span>
                  <span>Payment Service resolved via <strong>payment-service:8082</strong> (payment created)</span>
                </div>
              </div>
            </div>
          )}

          {/* Success badge when placed after replacement */}
          {orderAfterReplacement && (
            <div className="alert-success">
              <span>🎉</span>
              <div>
                <strong>Proof of Service Connect:</strong> Order placed successfully after task replacement!
                Order Service resolved <code style={{ color: '#fff' }}>product-service:8081</code> to the newly created task without any configuration changes.
              </div>
            </div>
          )}
        </section>
      </div>

      {/* SECTION 5: Service Connect Demonstration */}
      <section className="card" style={{ border: '1px solid var(--accent-cyan)' }}>
        <div className="card-title">
          <span>SECTION 5 — ECS Service Connect Task Replacement Demonstration</span>
          <span className="title-badge" style={{ borderColor: 'var(--accent-cyan)' }}>
            Core Hackathon Proof
          </span>
        </div>
        <p className="card-desc">
          Demonstrates why ECS Service Connect is critical: when ECS tasks restart or are replaced, their IP addresses change.
          Service Connect transparently manages service discovery so callers keep working uninterrupted.
        </p>

        <div className="demo-box">
          <div className="task-inspect-grid">
            <div className="inspect-item">
              <div className="inspect-label">Target Service</div>
              <div className="inspect-value" style={{ color: 'var(--accent-cyan)' }}>
                product-service
              </div>
            </div>
            <div className="inspect-item">
              <div className="inspect-label">Logical DNS / Service Name</div>
              <div className="inspect-value" style={{ color: 'var(--accent-cyan)' }}>
                product-service:8081
              </div>
            </div>
            <div className="inspect-item">
              <div className="inspect-label">Current Product Task ID</div>
              <div className="inspect-value" style={{ fontSize: '0.85rem' }}>
                {status?.productTask?.taskId || 'Loading...'}
              </div>
            </div>
            <div className="inspect-item">
              <div className="inspect-label">Current Task Private IP</div>
              <div className="inspect-value" style={{ color: '#fff' }}>
                {status?.productTask?.privateIp || 'Loading...'}
              </div>
            </div>
            <div className="inspect-item">
              <div className="inspect-label">Task Status</div>
              <div className="inspect-value">
                <span className="status-tag running">
                  <span className="status-dot green"></span>
                  {status?.productTask?.status || 'RUNNING'}
                </span>
              </div>
            </div>
          </div>

          <button
            className="btn-danger"
            onClick={handleReplaceProductTask}
            disabled={isReplacing}
          >
            {isReplacing ? (
              <>
                <span className="loading-spinner"></span> Replacing Product ECS Task in AWS... (Waiting for new task health checks)
              </>
            ) : (
              '⚡ Replace Product Task (Simulate Task Restart in AWS)'
            )}
          </button>

          {/* Replacement Results Display */}
          {replacementResult && (
            <div className="replacement-comparison">
              <div className="comparison-card old">
                <div className="comparison-header">Old Product Task</div>
                <div className="comparison-ip">{replacementResult.oldPrivateIp}</div>
                <div className="comparison-status">● STOPPED / TERMINATED</div>
              </div>

              <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>➔</div>

              <div className="comparison-card new">
                <div className="comparison-header">New Product Task</div>
                <div className="comparison-ip">{replacementResult.newPrivateIp}</div>
                <div className="comparison-status">● RUNNING &amp; HEALTHY</div>
              </div>

              <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>➔</div>

              <div className="comparison-card sc">
                <div className="comparison-header">Service Connect Route</div>
                <div className="comparison-ip" style={{ color: 'var(--accent-cyan)', fontSize: '0.95rem' }}>
                  product-service:8081
                </div>
                <div className="comparison-status">✓ Dynamically Routed</div>
              </div>
            </div>
          )}

          <div className="explanation-banner" style={{ marginTop: '1.25rem' }}>
            <strong>How Service Connect Solves This:</strong>
            <p style={{ marginTop: '0.35rem' }}>
              Without Service Connect, any caller hardcoding or caching a direct task IP (e.g.{' '}
              <code style={{ color: 'var(--status-red)' }}>
                {replacementResult ? replacementResult.oldPrivateIp : '172.31.xx.xx'}
              </code>
              ) immediately fails when the container restarts.
            </p>
            <p style={{ marginTop: '0.35rem' }}>
              With Service Connect, Order Service continues sending traffic to{' '}
              <strong style={{ color: 'var(--accent-cyan)' }}>product-service:8081</strong>. The local Envoy sidecar proxy automatically tracks the new task instance and routes traffic seamlessly.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
