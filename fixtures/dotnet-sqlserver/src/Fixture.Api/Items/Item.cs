namespace Fixture.Api.Items;

/// <summary>A lendable item.</summary>
public sealed class Item
{
    public Guid Id { get; set; }

    public required string Name { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
