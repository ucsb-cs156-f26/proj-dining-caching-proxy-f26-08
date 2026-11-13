package edu.ucsb.cs156.diningcachingproxy.controller;

import edu.ucsb.cs156.diningcachingproxy.collections.CachedResponse;
import edu.ucsb.cs156.diningcachingproxy.collections.CachedResponseRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@Tag(name = "Admin - Cached Endpoints")
@RequestMapping("/api/admin/endpoints")
@RestController
public class CachedEndpointsController {

  @Autowired private CachedResponseRepository cachedResponseRepository;

  public record CachedEndpointDTO(
      String id,
      String requestPath,
      long hitCount,
      int responseStatus,
      String responseBody,
      Instant cachedAt) {

    public CachedEndpointDTO(CachedResponse cachedResponse) {
      this(
          cachedResponse.getId(),
          cachedResponse.getRequestPath(),
          cachedResponse.getHitCount(),
          cachedResponse.getResponseStatus(),
          cachedResponse.getResponseBody(),
          cachedResponse.getCachedAt());
    }
  }

  @Operation(summary = "List all cached API endpoints with response details")
  @PreAuthorize("hasRole('ROLE_ADMIN')")
  @GetMapping("")
  public List<CachedEndpointDTO> allEndpoints() {
    return cachedResponseRepository.findAll().stream().map(CachedEndpointDTO::new).toList();
  }

  @Operation(summary = "Delete a single cached response by ID")
  @PreAuthorize("hasRole('ROLE_ADMIN')")
  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteEndpoint(@PathVariable String id) {
    if (!cachedResponseRepository.existsById(id)) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cached response not found");
    }

    cachedResponseRepository.deleteById(id);
  }
}
