package com.example.demo.service;

import com.example.demo.model.Order;
import com.example.demo.repository.OrderRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Optional;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final RestClient restClient;

    @Value("${product.service.url}")
    private String productServiceUrl;

    @Value("${payment.service.url}")
    private String paymentServiceUrl;

    public OrderService(
            OrderRepository orderRepository,
            RestClient restClient) {

        this.orderRepository = orderRepository;
        this.restClient = restClient;
    }

    public Order createOrder(Order order) {

        // 1. Ask Product Service for product details
        ProductResponse product = restClient.get()
                .uri(productServiceUrl + "/products/" + order.getProductId())
                .retrieve()
                .body(ProductResponse.class);

        if (product == null) {
            throw new RuntimeException("Product not found");
        }

        // 2. Calculate price using Product Service data
        double totalPrice =
                product.price() * order.getQuantity();

        order.setPrice(totalPrice);

        // 3. Save order
        Order savedOrder = orderRepository.save(order);

        // 4. Ask Payment Service to process payment
        PaymentResponse payment = restClient.post()
                .uri(paymentServiceUrl + "/payments")
                .body(new PaymentRequest(
                        savedOrder.getId(),
                        totalPrice
                ))
                .retrieve()
                .body(PaymentResponse.class);

        return savedOrder;
    }

    public List<Order> getAllOrders() {
        return orderRepository.findAll();
    }

    public Optional<Order> getOrderById(Long id) {
        return orderRepository.findById(id);
    }

    public record ProductResponse(
            Long id,
            String name,
            Double price,
            Integer stock
    ) {
    }

    public record PaymentRequest(
            Long orderId,
            Double amount
    ) {
    }

    public record PaymentResponse(
            Long id,
            Long orderId,
            Double amount,
            String status
    ) {
    }
}