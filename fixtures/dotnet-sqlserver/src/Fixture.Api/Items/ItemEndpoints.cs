using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Fixture.Api.Items;

/// <summary>The request to create an item.</summary>
public sealed record CreateItemRequest([property: Required, StringLength(120, MinimumLength = 1)] string Name);

/// <summary>An item as the API returns it.</summary>
public sealed record ItemDto(Guid Id, string Name, DateTimeOffset CreatedAt);

/// <summary>The /api/items endpoints.</summary>
public static class ItemEndpoints
{
    public static IEndpointRouteBuilder MapItemEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/items");
        group.MapGet("/{id:guid}", GetById);
        group.MapPost("/", Create);
        return app;
    }

    private static async Task<Results<Ok<ItemDto>, NotFound>> GetById(Guid id, FixtureDbContext db, CancellationToken ct)
    {
        var item = await db.Items.AsNoTracking().Where(i => i.Id == id).Select(i => new ItemDto(i.Id, i.Name, i.CreatedAt)).SingleOrDefaultAsync(ct);
        return item is null ? TypedResults.NotFound() : TypedResults.Ok(item);
    }

    private static async Task<Created<ItemDto>> Create(CreateItemRequest request, FixtureDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var item = new Item { Id = Guid.NewGuid(), Name = request.Name, CreatedAt = clock.GetUtcNow() };
        db.Items.Add(item);
        await db.SaveChangesAsync(ct);
        return TypedResults.Created($"/api/items/{item.Id}", new ItemDto(item.Id, item.Name, item.CreatedAt));
    }
}
